import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import * as authService from "@/services/authService";
import type { AuthOutcome } from "@/services/authService";
import { forgetUser, identifyUser } from "@/services/revenueCatService";
import * as biometricAuth from "@/services/biometricAuth";
import { credentialMatchesUser } from "@/utils/biometricLogin";
import { useAppStore } from "./appStore";
import { useSubscriptionStore } from "./useSubscriptionStore";
import { useFamilyStore } from "./familyStore";
import { syncAllWindowedDays } from "@/services/nutritionSyncService";

// The persisted stores that hold the user's own content. Cleared from the device on account
// deletion so nothing personal is left at rest. Device preferences that are not personal data
// (siutimsiudai-app: locale / units / onboarding) are left alone, and the subscription mirror is reset
// separately by applySession(null).
const PERSONAL_DATA_KEYS = [
  "siutimsiudai-nutrition",
  "siutimsiudai-recipes",
  "siutimsiudai-pantry",
  "siutimsiudai-meal-plan",
  "siutimsiudai-grocery",
  "siutimsiudai-saved-meals",
  "siutimsiudai-family",
];

// Best-effort wipe of the on-device copy of the user's data. Runs only after the account is already
// gone server-side, so a failure here must never block the sign-out that follows.
async function wipeLocalUserData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(PERSONAL_DATA_KEYS);
  } catch {
    // Ignore: the account is deleted regardless; the keys clear on the next launch at worst.
  }
}

// In-memory mirror of the Supabase auth session. Supabase persists the real session itself (see
// services/supabase.ts), so this store is NOT persisted; it just exposes the current session to
// React and the route gate, and holds the transient state the email-verification flow needs.

interface AuthState {
  // False until the initial getSession() resolves. The route gate waits on this to avoid a flash.
  initialized: boolean;
  session: Session | null;
  user: User | null;
  // The email + password of an account that just signed up and is awaiting verification. RAM only,
  // never persisted, so the verify screen can retry sign-in the moment the user clicks the link.
  pendingEmail: string | null;
  pendingPassword: string | null;

  // --- password recovery ---
  // Two flags, because they answer two different questions.
  //
  // `recoveryRequested` — did the user ask for a reset link on THIS device, in this session? Set
  // when the forgot-password screen sends the email. It exists because the PKCE flow can hand the
  // link back as a bare `?code=...` with no type, leaving the returning deep link indistinguishable
  // from an email confirmation. This is the local record that disambiguates it. RAM only: a flag
  // that survived a restart could misread an unrelated link days later.
  //
  // `recoveryPending` — is the user, right now, sitting on a session that owes us a new password?
  // This is what the route gate reads. Nothing else may set it: it is the difference between the
  // reset screen appearing when it should and appearing over somebody's dashboard.
  recoveryRequested: boolean;
  recoveryPending: boolean;

  // --- auth deep links ---
  /** A link is being exchanged for a session right now. The route gate freezes while this is true. */
  linkResolving: boolean;
  /** The last auth link failed to produce a session. */
  linkFailed: boolean;
  /** ...and specifically because GoTrue said it was invalid or already used. */
  linkExpired: boolean;

  init: () => void;
  /** Turn an incoming auth deep link into a session. The single owner of that job. */
  resolveAuthLink: (url: string) => Promise<void>;
  applySession: (session: Session | null) => void;
  setPending: (email: string, password: string) => void;
  clearPending: () => void;
  /** The forgot-password screen just emailed a link from this device. */
  markRecoveryRequested: () => void;
  /** A deep link resolved to a recovery session: hold the user on the reset screen. */
  beginRecovery: () => void;
  /** The new password is set (or the user backed out): release the gate. */
  endRecovery: () => void;
  signOut: () => Promise<void>;
  // Permanently delete the account server-side, wipe the device's copy of the user's data, and
  // clear the session. Resolves with the service outcome so the screen can surface a failure.
  deleteAccount: () => Promise<AuthOutcome>;
}

// Module-scoped rather than store state, so it survives a Fast Refresh and a StrictMode double
// mount. init() spends a one-time auth code, so running it twice would submit an already-used code
// and report a failure on a link that in fact worked.
let started = false;

// Reconcile the keychain credential with whoever is actually signed in. Never throws: a keychain
// that refuses to cooperate must not be able to break signing in.
async function syncBiometricCredential(session: Session | null): Promise<void> {
  try {
    const credential = await biometricAuth.getStoredCredential();
    if (!credential) return;
    if (!credentialMatchesUser(credential, session?.user?.id)) {
      // Registered to somebody else. Drop it rather than offering the wrong account.
      await biometricAuth.disable();
      return;
    }
    await biometricAuth.refreshStoredToken(session);
  } catch {
    // Leave the credential as it is. A failed sync means a possibly stale token, which surfaces as
    // one failed Face ID attempt that clears itself, not as a broken sign-in.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  initialized: false,
  session: null,
  user: null,
  pendingEmail: null,
  pendingPassword: null,
  recoveryRequested: false,
  recoveryPending: false,
  linkResolving: false,
  linkFailed: false,
  linkExpired: false,

  // Shared by both arrival paths: the link that launched the app, and one that arrives while it is
  // already running. Keeping them on one code path is the point — they used to differ, and the warm
  // path was the broken one.
  resolveAuthLink: async (url) => {
    set({ linkResolving: true });
    try {
      const result = await authService.completeAuthFromUrl(url);
      // Not an auth link at all (a family invite, or a plain launch URL). Leave every flag alone:
      // this handler sees every deep link the app receives, and most of them are not its business.
      if (!result.isAuthLink) return;
      if (!result.ok) {
        set({ linkFailed: true, linkExpired: result.expired });
        return;
      }
      set({ linkFailed: false, linkExpired: false });
      // `recoveryRequested` is the backstop for a PKCE link that comes back with its type stripped,
      // where the URL alone cannot tell a recovery from an email confirmation.
      if (result.recovery || get().recoveryRequested) set({ recoveryPending: true });
    } catch {
      // A malformed link must not wedge the gate shut.
      set({ linkFailed: true });
    } finally {
      set({ linkResolving: false });
    }
  },

  init: () => {
    if (started) return;
    started = true;
    const client = supabase;
    if (!client) {
      // No backend in this environment: settle immediately so the gate can route to sign-in
      // (which will show a friendly "unavailable" message if the user tries to authenticate).
      set({ initialized: true });
      return;
    }
    // Subscribe before anything can emit. The code exchange below raises PASSWORD_RECOVERY, and
    // supabase-js only notifies the subscribers registered at that instant — register afterwards
    // and the event is delivered to an empty room.
    client.auth.onAuthStateChange((event, session) => {
      get().applySession(session);
      // Keep the biometric credential honest, on the two events that can invalidate it.
      //
      // TOKEN_REFRESHED: Supabase rotates the refresh token, so the copy in the keychain is now one
      // generation behind and will stop working once its reuse window closes. Rewrite it.
      //
      // SIGNED_IN: this may be a different person on a shared device. If the credential belongs to
      // somebody else it is cleared, otherwise it is brought up to date. Without this, signing out
      // and letting a friend sign in would leave a Face ID button that opens YOUR food diary.
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        void syncBiometricCredential(session);
      }
      if (event === "SIGNED_IN") {
        // Publish any already-kept diary so a manager who links sees history without waiting for
        // the next edit. Best-effort and windowed on the dependent's device.
        void syncAllWindowedDays();
      }
      // Supabase raises this when it recognises a recovery session itself. It does not fire on
      // every path we support (the manual verifyOtp the deep-link handler runs may not trigger
      // it), so the link resolution below sets the flag too. Both routes converge on the same
      // state, and setting it twice is harmless.
      if (event === "PASSWORD_RECOVERY") set({ recoveryPending: true });
    });

    // THE listener for auth deep links that arrive while the app is already running.
    //
    // It lives here, registered once at boot, rather than on the callback screen, because a screen
    // physically cannot subscribe in time to hear the event that routed to it. React Native
    // dispatches "url", expo-router navigates to /auth/callback, and only then does that screen
    // mount and call addEventListener — by which point the event has been delivered and is gone.
    // The listener never fired, no session was created, and the gate replaced the callback screen
    // with sign-in. That is why tapping a password reset link while the app was open landed on the
    // sign-in screen instead of the reset screen: the app had to be fully quit for the link to work,
    // because only then did the launch-URL path below handle it.
    //
    // One owner for the URL, both arrival paths, no mounting race.
    Linking.addEventListener("url", ({ url }) => {
      void get().resolveAuthLink(url);
    });

    void (async () => {
      // Resolve the link that LAUNCHED the app before reporting ready. The route gate stays shut
      // until `initialized` flips, so in this order a recovery link has already raised its flag by
      // the time the gate is allowed to route. Harmless on an ordinary launch: a URL carrying no
      // auth token resolves to "not an auth link" and nothing changes.
      try {
        const launchUrl = await Linking.getInitialURL();
        if (launchUrl) await get().resolveAuthLink(launchUrl);
      } catch {
        // A malformed or already-spent link must never stop the app from starting.
      }
      const recovery = get().recoveryPending;
      const { data } = await client.auth.getSession();
      get().applySession(data.session);
      // Re-assert after applySession, which clears both recovery flags when there is no session: a
      // recovery link that failed to produce one must not pin the user to the reset screen.
      if (recovery && data.session) set({ recoveryPending: true });
      set({ initialized: true });
    })();
  },

  applySession: (session) => {
    set({ session, user: session?.user ?? null });
    // Keep the legacy appStore id in sync for existing consumers.
    useAppStore.getState().setSession(session?.user?.id ?? null);
    if (session) {
      // A live session means verification is done; drop any pending retry credentials.
      set({ pendingEmail: null, pendingPassword: null });
      // Attach RevenueCat's receipt to this account so the tier follows the user across devices
      // and reinstalls. Fire-and-forget and a no-op until a real build makes the SDK available.
      identifyUser(session.user.id).catch(() => {});
    } else {
      // No session means no recovery in progress. Clearing both flags here is what stops a user who
      // backs out of the reset screen (or is signed out mid-flow) from being dumped straight back
      // onto it the next time they sign in.
      set({ recoveryRequested: false, recoveryPending: false });
      // No authenticated user: reset the per-account subscription mirror so the next account (e.g.
      // a fresh sign-up) starts on free instead of inheriting the previous user's tier. A live
      // RevenueCat build repopulates the real entitlement once the next user signs in.
      useSubscriptionStore.getState().resetTierForNewAccount();
      // Clear any cached family roster and pending invite so the next account starts clean and a
      // previous user's household never leaks onto a shared device.
      useFamilyStore.getState().reset();
      // Detach from RevenueCat so the next account starts from its own anonymous receipt.
      forgetUser().catch(() => {});
    }
  },

  setPending: (pendingEmail, pendingPassword) => set({ pendingEmail, pendingPassword }),
  clearPending: () => set({ pendingEmail: null, pendingPassword: null }),

  markRecoveryRequested: () => set({ recoveryRequested: true }),
  beginRecovery: () => set({ recoveryPending: true }),
  // Also drops `recoveryRequested`: the link has been used, so keeping the memory around would only
  // let the next unrelated deep link be misread as another recovery.
  endRecovery: () => set({ recoveryPending: false, recoveryRequested: false }),

  signOut: async () => {
    // With biometric sign-in registered, a normal signOut would revoke the very refresh token the
    // keychain is holding, and the Face ID button would be dead on arrival. So when the feature is
    // on we sign out locally and leave the session alive behind the biometric gate. It returns
    // false whenever the feature is off, which is the ordinary path.
    const kept = await biometricAuth.signOutPreservingBiometrics();
    if (!kept) await authService.signOut();
    // onAuthStateChange will also fire on the revoking path; clear locally for an instant response,
    // and because the preserving path makes no server call and so raises no event at all.
    get().applySession(null);
  },

  deleteAccount: async () => {
    const outcome = await authService.deleteAccount();
    if (!outcome.ok) return outcome;
    // Account is gone server-side: erase this device's copy of the user's data, then clear the
    // in-memory session. The route gate drops back to sign-in the moment the session is null.
    // The keychain credential goes too, or the sign-in screen would offer Face ID for an account
    // that no longer exists.
    await biometricAuth.disable();
    await wipeLocalUserData();
    get().applySession(null);
    return outcome;
  },
}));
