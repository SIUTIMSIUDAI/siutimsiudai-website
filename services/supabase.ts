import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { secureSessionStorage } from "./secureSessionStorage";

// Supabase client. With no env vars set this stays null and the whole app runs local-first
// against the Zustand stores (Expo Go without config, jest, web preview).
// Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY to activate. Only the *publishable*
// anon key belongs here; it is inlined into the bundle and is safe to ship. Billable secrets
// (service_role, Google key) never live client-side.
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// The AsyncStorage key supabase-js keeps the session under. Spelled out rather than left to the
// default so that biometric sign-in can drop the persisted session without a server round trip (see
// services/biometricAuth.ts), using only the documented `storageKey` option instead of reaching
// into the client. The formula reproduces supabase-js's own default exactly, so upgrading to this
// does not orphan the session of anyone who is already signed in.
export const sessionStorageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : "sb-local-auth-token";

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storageKey: sessionStorageKey,
        // The user's own session (a short-lived JWT + rotating refresh token). Held in the OS
        // keychain / Keystore via secureSessionStorage, so it is encrypted at rest and never in a
        // device backup — a plain-AsyncStorage copy could be lifted off a rooted or forensically
        // imaged phone. Existing users are migrated off the old AsyncStorage key on first read; web
        // has no keychain and falls back to AsyncStorage inside the adapter.
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        // PKCE is the secure flow for native OAuth: the code is exchanged for a session using a
        // verifier held only on-device, so an intercepted redirect URL is useless on its own.
        flowType: "pkce",
        // Off on EVERY platform, web included, because this app resolves auth links itself in
        // authService.completeAuthFromUrl. Left on, supabase-js races us for the same `?code=`
        // during createClient(): it exchanges the code, then deletes the parameter from the address
        // bar via history.replaceState. Our handler then finds a bare URL, reports failure, and the
        // recovery flag never gets set — so a password-reset link silently lands the user on the
        // sign-in screen. It breaks the OAuth popup the same way, since the popup would consume the
        // code that the opening window is waiting to exchange. One owner for the URL, no race.
        detectSessionInUrl: false,
      },
    })
  : null;

// Keep tokens fresh only while the app is foregrounded. Supabase's own timer pauses in the
// background where JS is frozen anyway; this restarts it on resume. Web manages this itself.
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
