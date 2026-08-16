import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { normaliseAuthRedirect, parseAuthFragment } from "@/utils/authRedirect";
import { isAppleCancellation, toHex } from "@/utils/appleAuth";
import { isPasswordPwned } from "./pwnedPasswordService";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

// Thin, swappable wrapper over Supabase Auth so screens stay declarative and the provider can be
// replaced in one file. Every call is null-guarded: when Supabase is not configured (Expo Go
// without env, jest, web preview) the flow degrades to a friendly "unavailable" outcome instead
// of throwing, keeping the whole app testable offline.

// Dismisses the web auth popup once the redirect completes. No-op on native.
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "apple";

export interface AuthOutcome {
  ok: boolean;
  // Machine code for the caller to branch on; screens map it to localized copy.
  error?:
    | "unavailable"
    | "cancelled"
    | "invalid_credentials"
    | "already_registered"
    | "not_confirmed"
    | "no_password"
    | "same_password"
    | "weak_password"
    | "leaked_password"
    | "rate_limited"
    | "unknown";
  // Email signup only: true when the project requires email confirmation, so no session exists yet.
  needsVerification?: boolean;
}

// The single redirect target for every browser-based auth return. `siutimsiudai://auth/callback` in a
// standalone build, an Expo Go proxy URL in development. Matches app/auth/callback.tsx.
//
// Normalised on the way out, and never sent raw. expo-linking emits a hostless three-slash URL in a
// standalone build, Supabase's allow-list is an exact string match, and a miss redirects to the
// marketing site instead of failing loudly. See utils/authRedirect.ts for the full story.
function callbackUrl(): string {
  return normaliseAuthRedirect(Linking.createURL("/auth/callback"));
}

/**
 * The parts of a supabase-js `AuthError` this module reads.
 *
 * Structural rather than the imported class, for two reasons: tests can hand in a plain object
 * instead of constructing a real GoTrue error, and `reasons` exists only on the
 * `AuthWeakPasswordError` subclass, which the `AuthError` type the SDK hands back does not declare.
 */
interface AuthErrorLike {
  message?: string;
  /** Stable machine code, sent by GoTrue from API version 2024-01-01 onwards. */
  code?: string;
  /** `AuthWeakPasswordError` only: why the password was refused. */
  reasons?: readonly string[];
}

/**
 * Turn a GoTrue error into a code the screens can map to copy.
 *
 * Reads `error.code` where one exists and only falls back to matching the English message where it
 * does not. The prose is a last resort on purpose: it is not part of anyone's API contract and a
 * GoTrue release is free to reword it, which would silently turn a specific, actionable error into
 * the generic "something went wrong".
 */
function classify(error: AuthErrorLike | null | undefined): AuthOutcome["error"] {
  // A refused password is the one case where the code alone is not specific enough. GoTrue answers
  // `weak_password` both for a password that breaks the composition policy and for one that is
  // merely known to have leaked, and those need opposite advice — see the note on `pwned` below.
  // AuthWeakPasswordError sets this code itself, so it is present even on the legacy path where the
  // server sent no error code at all (auth-js lib/fetch.js, lib/errors.js).
  if (error?.code === "weak_password") return weakPasswordReason(error.reasons);

  const m = (error?.message ?? "").toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) return "already_registered";
  if (m.includes("not confirmed") || m.includes("email not confirmed")) return "not_confirmed";
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "invalid_credentials";
  // GoTrue rejects a password identical to the current one, and rejects one that fails the
  // server-side strength policy mirrored in supabase/config.toml. Both are user-fixable, so they
  // deserve their own message instead of the generic "something went wrong".
  if (m.includes("should be different from the old password")) return "same_password";
  if (m.includes("password should be") || m.includes("password is too weak")) return "weak_password";
  // Recovery emails are rate limited per address. Telling the user to wait is far better than
  // implying the address is wrong.
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("for security purposes"))
    return "rate_limited";
  return "unknown";
}

/**
 * Split a weak-password refusal into "you broke a rule" and "this password has leaked".
 *
 * GoTrue's `reasons` are "length", "characters" and "pwned". The first two mean the password misses
 * the composition policy in supabase/config.toml, and `auth.errPasswordWeak` — which lists the
 * minimum length and the four character classes — is exactly the right thing to say.
 *
 * It is exactly the wrong thing to say for "pwned". That reason means the password satisfies every
 * composition rule and is still refused, because it appears in HaveIBeenPwned's breach corpus.
 * `Password123!` is the canonical example, and note that it clears the raised 12-character minimum
 * too: the live checklist on the sign-up screen shows five green ticks while the server refuses it.
 * Telling that user to add a capital letter asks them to do the thing they can see they have
 * already done, and leaves them no way to discover what is actually wrong.
 *
 * Only reachable once leaked-password protection is switched on, which needs a Pro project.
 */
function weakPasswordReason(reasons: readonly string[] | undefined): AuthOutcome["error"] {
  return reasons?.includes("pwned") ? "leaked_password" : "weak_password";
}

const UNAVAILABLE: AuthOutcome = { ok: false, error: "unavailable" };

/**
 * The same outcome GoTrue produces for `reasons: ["pwned"]`, raised by our own breach check instead.
 *
 * It is the identical code, so it renders the identical sentence and needs no screen changes. If the
 * project is ever moved to a Pro plan and leaked-password protection is switched on server-side,
 * this becomes a redundant early exit rather than a second thing to maintain.
 *
 * WHERE THE CHECK RUNS, AND WHERE IT MUST NOT
 *
 * On the three paths that SET a password — sign-up, change, and recovery reset — and on none of the
 * paths that USE one. Refusing a breached password at sign-in would be a catastrophe dressed as a
 * security feature: the user whose password has leaked is exactly the user who most needs to get in
 * and change it, and locking them out hands the account to whoever else holds that password. Note
 * that Supabase agrees, and takes care to: GoTrueClient attaches `weakPassword` to a SUCCESSFUL
 * sign-in as a warning, with `error: null`.
 */
const LEAKED: AuthOutcome = { ok: false, error: "leaked_password" };

export async function signUpWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  // Before the account exists, not after. A breached password caught here costs the user one more
  // attempt; caught later it would mean an account already standing on a password on every list.
  if (await isPasswordPwned(password)) return LEAKED;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) return { ok: false, error: classify(error) };
  // With "Confirm email" enabled, signUp returns no session until the link is clicked.
  return { ok: true, needsVerification: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  // No breach check here, on purpose. Signing a user out of their own account because their password
  // has leaked is how you guarantee the attacker gets there first. See the note on LEAKED.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: classify(error) };
  return { ok: true };
}

export async function resendVerification(email: string): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) return { ok: false, error: classify(error) };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

// --- password management ----------------------------------------------------------------------

// After a password changes, every OTHER device holding a session for this account is signed out.
// A password change is usually a reaction to "someone may have my password", and it is worthless as
// a remedy if the intruder's existing session keeps working. `scope: "others"` leaves the device
// doing the changing signed in, so the user is not thrown back to the sign-in screen for doing the
// right thing.
//
// Deliberately best-effort and never surfaced: by the time this runs the password is ALREADY
// changed server-side. Reporting a failure here would tell the user the change did not happen when
// it did, and send them round the loop again with a "current password" that is no longer current.
// The worst case is a stale session elsewhere, which the next token refresh clears anyway.
async function revokeOtherSessions(): Promise<void> {
  try {
    await supabase?.auth.signOut({ scope: "others" });
  } catch {
    // Ignore, as documented above.
  }
}

/**
 * Change the password of the signed-in user, after proving they know the current one.
 *
 * Supabase does NOT require the old password for `updateUser({ password })` — this project has
 * `secure_password_change` off, because the alternative flow emails a nonce and would put an inbox
 * round trip in front of a routine settings change. So the check lives here: we re-run
 * `signInWithPassword` with the current credentials first, and only proceed if it succeeds. Without
 * it, anyone holding an unlocked phone could take the account in four taps.
 *
 * A failed verification leaves the existing session completely untouched: supabase-js only writes a
 * session on success, so a typo costs the user nothing.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;

  // Read the address from the local session rather than getUser(): no network call, and it is the
  // same value the verification below must be run against.
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;
  // No session, or an OAuth account with no address to sign in with. Callers already hide the
  // screen for OAuth-only accounts (see utils/authIdentity), so this is the belt to that braces.
  if (!email) return { ok: false, error: "no_password" };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) {
    const code = classify(verifyError);
    // This step asks one question — "is this your current password?" — so an unrecognised refusal
    // is reported as a wrong password, which is what it almost always is.
    //
    // These four are not, and flattening them into "incorrect password" would send the user round a
    // loop retyping a password that was never the problem. An outage is not a wrong password. A
    // throttled account is not a wrong password, and calling it one makes the user retry the
    // correct password until they are throttled harder. And a password refused for being weak or
    // breached is being refused precisely BECAUSE it is their current password — that user is on
    // this screen to fix exactly that, so it is the worst possible moment to tell them they typed
    // it wrong.
    const isTruer =
      code === "unknown" ||
      code === "rate_limited" ||
      code === "weak_password" ||
      code === "leaked_password";
    return { ok: false, error: isTruer ? code : "invalid_credentials" };
  }

  // After the identity check, never before it. A wrong current password is the more urgent thing to
  // report, and this way the hash prefix only leaves the device for someone who has just proved the
  // account is theirs. It is also where GoTrue itself would refuse: at the update, not the verify.
  if (await isPasswordPwned(newPassword)) return LEAKED;

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { ok: false, error: classify(updateError) };

  await revokeOtherSessions();
  return { ok: true };
}

/**
 * Set a new password for a session that came from an emailed recovery link.
 *
 * No current password is asked for, and that is correct rather than a shortcut: the link itself is
 * the proof of identity, and the user is here precisely because they cannot supply the old one.
 * Only ever reached behind the recovery gate (see utils/authGate), so a normally signed-in user
 * cannot land on this path and skip the verification that `changePassword` enforces.
 */
export async function setNewPassword(newPassword: string): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  // This user is very often here BECAUSE their old password was compromised. Letting them replace it
  // with one that is already in the breach corpus would end the flow exactly where it started.
  if (await isPasswordPwned(newPassword)) return LEAKED;
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: classify(error) };
  await revokeOtherSessions();
  return { ok: true };
}

/**
 * Email a password recovery link.
 *
 * Supabase answers the same way whether or not an account exists for the address, and the screen
 * shows the same confirmation either way. That is intentional: a form that says "no account with
 * that email" is a free tool for checking which addresses are registered here. The one thing worth
 * distinguishing is the per-address rate limit, so a user tapping again is told to wait rather than
 * left wondering whether the first one failed.
 */
export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(),
  });
  if (error) return { ok: false, error: classify(error) };
  return { ok: true };
}

// Permanently delete the signed-in user's account. The deletion itself needs the Supabase service
// role key — an admin secret that must never ship in the app — so it runs in the delete-account
// Edge Function (supabase/functions/delete-account), which reads the caller's own session token and
// deletes exactly that user. We then clear the now-invalid local session. Null-guarded like the
// rest of this file, so a no-backend environment returns "unavailable" instead of throwing.
export async function deleteAccount(): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) return { ok: false, error: "unknown" };
  // Local scope: just drop this device's tokens. The account is already gone server-side, so a
  // global sign-out would only try (and fail) to revoke a session that no longer exists.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}

// Supabase's public auth settings list which providers the project has enabled. We check this
// before opening the browser: a not-yet-configured provider (e.g. Google switched off in the
// dashboard) otherwise dumps the user on Supabase's raw JSON error page. Any fetch hiccup returns
// true so a genuinely working provider is never blocked by a flaky settings call.
async function providerEnabled(provider: OAuthProvider): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    });
    if (!res.ok) return true;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return json.external?.[provider] !== false;
  } catch {
    return true;
  }
}

// Browser OAuth (works in Expo Go, web, and simulators; no native modules). We ask Supabase for
// the provider consent URL, open it in a secure auth session, then exchange the returned PKCE
// code for a session. On success onAuthStateChange fires and the route gate advances.
export async function signInWithProvider(provider: OAuthProvider): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  // Fail clean when the provider is not enabled server-side, instead of opening the browser onto
  // Supabase's "provider is not enabled" error page.
  if (!(await providerEnabled(provider))) return UNAVAILABLE;
  const redirectTo = callbackUrl();
  // Dev aid: the exact return URL Supabase must have on its Redirect URLs allowlist. In Expo Go
  // this is an exp:// URL tied to your machine's LAN IP, so it shifts between networks.
  if (__DEV__) console.log("[auth] OAuth redirect URL (allowlist this in Supabase):", redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, error: "unknown" };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) return { ok: false, error: "cancelled" };

  const completed = await completeAuthFromUrl(result.url);
  return completed.ok ? { ok: true } : { ok: false, error: "unknown" };
}

/**
 * Whether the native Sign in with Apple sheet can actually be presented here.
 *
 * The sign-in screen calls this and hides the Apple button when it is false. Showing a button that
 * cannot work is what got build 12 rejected under guideline 2.1(a): the reviewer tapped Apple and
 * got "Sign in is temporarily unavailable", because the flow was browser OAuth against a Supabase
 * project with the Apple provider switched off. A button that is absent is honest; a button that
 * errors is a bug.
 *
 * iOS-only by construction. The module exists on Android and web but can never sign anyone in
 * there, and the Platform check keeps us from depending on how gracefully it declines.
 */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native Sign in with Apple: the system sheet, then Apple's identity token exchanged with Supabase.
 *
 * This replaces the browser OAuth path for Apple, and the reason is reliability rather than taste.
 * The browser flow needs a Services ID, a .p8 signing key, a Team ID, a Key ID and an
 * exactly-matching redirect URL on Supabase's allow-list, and any one of them being wrong fails at
 * the provider's page with an opaque message. The native flow needs the bundle identifier on
 * Supabase's Apple client-ID list and nothing else, and never leaves the app.
 *
 * The nonce is the fiddly part, so to be explicit about which side gets which value:
 *
 *   - Apple is handed the SHA-256 HASH, and echoes it into the identity token's `nonce` claim.
 *   - Supabase is handed the RAW value, because GoTrue hashes what you give it and compares that
 *     to the claim. supabase-js documents this on SignInWithIdTokenCredentials.nonce: "If the ID
 *     token contains a nonce claim, then the hash of this value is compared to the value in the ID
 *     token."
 *
 * Send the same value to both and every sign-in fails verification, which would look exactly like
 * the rejection we are fixing.
 */
export async function signInWithApple(): Promise<AuthOutcome> {
  if (!supabase) return UNAVAILABLE;
  if (!(await appleSignInAvailable())) return UNAVAILABLE;

  const rawNonce = await randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    // Dismissing the sheet is a decision, not a fault, so it must not raise an error banner.
    if (isAppleCancellation(e)) return { ok: false, error: "cancelled" };
    return { ok: false, error: "unknown" };
  }

  // No token means nothing to exchange. Rare, but it is the one field the whole flow depends on.
  if (!credential.identityToken) return { ok: false, error: "unknown" };

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) return { ok: false, error: classify(error) };
  return { ok: true };
}

// 32 bytes of CSPRNG output, hex-encoded. See utils/appleAuth for why hex.
async function randomNonce(): Promise<string> {
  return toHex(await Crypto.getRandomBytesAsync(32));
}

export interface AuthLinkResult {
  /** A session was established from the link. */
  ok: boolean;
  /**
   * The link was a password recovery link, so the user must be sent to set a new password rather
   * than into the app.
   *
   * Never guesses. Two independent sources feed it, because neither covers every link shape:
   *
   * - `type=recovery` in the URL, which is what an email `token_hash` link carries.
   * - `redirectType` off the exchange response, for PKCE. GoTrue's redirect hands back a bare
   *   `?code=...` with the type stripped, so the URL alone cannot tell a recovery from an email
   *   confirmation. supabase-js knows anyway: `resetPasswordForEmail` stashes the intent alongside
   *   the verifier as `"<verifier>/recovery"` and returns it here once the code is exchanged.
   */
  recovery: boolean;
  /**
   * The URL carried auth material at all.
   *
   * False means "this was not an auth link" — a family invite, or an ordinary cold launch with no
   * URL. Callers must treat that as "nothing happened" rather than as a failure, or every invite
   * link would raise an auth error.
   */
  isAuthLink: boolean;
  /** GoTrue rejected the link as invalid or already used, which deserves its own message. */
  expired: boolean;
}

const NO_LINK: AuthLinkResult = { ok: false, recovery: false, isAuthLink: false, expired: false };

// supabase-js returns the redirect type next to the session but does not declare it on
// AuthTokenResponse, so read it defensively rather than casting the whole response.
function redirectTypeOf(data: unknown): string | null {
  return (data as { redirectType?: string | null } | null)?.redirectType ?? null;
}

// Establish a session from a returned/deep-linked auth URL. Handles the three shapes Supabase can
// send: a PKCE `code` (OAuth), an email `token_hash`+`type` (confirmation link), or implicit
// tokens in the URL fragment. Safe to call with any URL.
export async function completeAuthFromUrl(url: string): Promise<AuthLinkResult> {
  if (!supabase) return NO_LINK;
  try {
    const { queryParams } = Linking.parse(url);
    const frag = parseAuthFragment(url);
    // The type can arrive either side of the `#` depending on which shape GoTrue sent.
    const type = (typeof queryParams?.type === "string" ? queryParams.type : null) ?? frag.type ?? null;

    // An expired or already-spent link comes back as
    // `#error=access_denied&error_code=otp_expired`. Reporting that as "not an auth link" is what
    // silently dropped the user on sign-in with nothing to explain it, so it is called out as a
    // failed auth link instead and the screen offers a fresh email.
    const errorCode = frag.error_code || frag.error;
    if (errorCode) {
      return { ok: false, recovery: false, isAuthLink: true, expired: errorCode === "otp_expired" };
    }

    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      // `type` is all but always absent on this branch, so the exchange response is what actually
      // identifies a recovery. Read the URL too, for the case where the type does survive.
      const recovery = redirectTypeOf(data) === "recovery" || type === "recovery";
      return { ok: !error, recovery: !error && recovery, isAuthLink: true, expired: false };
    }

    const tokenHash = typeof queryParams?.token_hash === "string" ? queryParams.token_hash : null;
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
      });
      return {
        ok: !error,
        recovery: !error && type === "recovery",
        isAuthLink: true,
        expired: false,
      };
    }

    // Implicit tokens in the fragment. This is the shape the emailed confirmation and recovery
    // links actually deliver: `{{ .ConfirmationURL }}` points at `/auth/v1/verify`, and that
    // endpoint answers with a 303 to `<redirect_to>#access_token=...&type=recovery`.
    if (frag.access_token && frag.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: frag.access_token,
        refresh_token: frag.refresh_token,
      });
      return {
        ok: !error,
        recovery: !error && type === "recovery",
        isAuthLink: true,
        expired: false,
      };
    }
  } catch {
    // Malformed URL or network error: fall through so the caller can show a retry.
  }
  return NO_LINK;
}
