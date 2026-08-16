// Guard for the two ways a refused password used to come back as something unhelpful.
//
// 1. A password refused for having LEAKED was reported as "Something went wrong. Please try again."
//
//    classify() matched English prose, looking for "password should be" or "password is too weak".
//    GoTrue's leaked-password refusal says the password is KNOWN to be weak and easy to guess, which
//    contains neither, so it fell through to "unknown". That is the worst possible outcome for the
//    single most fixable error in the whole auth surface: the user is told nothing actionable, and
//    retrying the same password fails forever.
//
//    Worse, the obvious "fix" — routing it to the existing weak-password copy — is also wrong. That
//    message lists the minimum length and the four character classes, and a leaked password has
//    already met every one of them. The canonical example, Password123!, is twelve characters with
//    all four classes, so it clears even the raised minimum: the live checklist on the sign-up
//    screen shows five green ticks while the server refuses it. Telling that user to add a capital
//    letter asks them to do what they can see they have already done.
//
//    So "pwned" gets its own code and its own sentence, and a "length"/"characters" refusal keeps
//    the composition advice, which is correct for it.
//
// 2. changePassword's verification step flattened every recognised code into "incorrect password".
//
//    The rule was `code === "unknown" ? "unknown" : "invalid_credentials"`, which keeps the ONE
//    unrecognised case and discards every specific one. A throttled user was told their correct
//    password was wrong, so they retried it and were throttled harder.
//
// These tests drive the private classify() through the public API, and build the errors with the
// real AuthWeakPasswordError from supabase-js rather than a hand-written shape — the whole fix
// rests on that class setting `code` itself, so the class is what should be under test.

const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();

// expo-linking reads the expo-constants manifest to find the URI scheme, which does not exist under
// Jest. Emit the hostless three-slash form a standalone build really produces, so the redirect still
// goes through the normaliser rather than round a stub.
jest.mock("expo-linking", () => ({
  createURL: (path: string) => `siutimsiudai://${String(path).replace(/^\/+/, "/")}`,
  parse: () => ({ queryParams: {} }),
}));

// Pinned to "not breached" for two separate reasons, both of which would be bugs to leave alone.
//
// Unmocked, the real check would fetch api.pwnedpasswords.com — a live network call from the test
// suite. And "Password123!" below IS in the corpus, so the check would short-circuit and return
// leaked_password before supabase-js was ever reached. Every assertion in this file would then pass
// while testing nothing it claims to: classify() would not run at all.
jest.mock("@/services/pwnedPasswordService", () => ({ isPasswordPwned: async () => false }));

jest.mock("@/services/supabase", () => ({
  supabase: {
    auth: {
      signUp: (...a: unknown[]) => mockSignUp(...a),
      signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      getSession: (...a: unknown[]) => mockGetSession(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "sb_publishable_test",
  isSupabaseConfigured: true,
}));

import { AuthWeakPasswordError, AuthApiError } from "@supabase/supabase-js";
import { changePassword, setNewPassword, signUpWithEmail } from "@/services/authService";
import { authErrorKey } from "@/utils/authErrorCopy";
import en from "@/i18n/en.json";
import zhHant from "@/i18n/zh-Hant.json";

// The message GoTrue sends when HaveIBeenPwned matches. Quoted verbatim because the point of the
// fix is that we no longer read it.
const PWNED_MESSAGE = "Password is known to be weak and easy to guess, please choose a different one.";

/** A weak-password refusal exactly as supabase-js raises it. */
function weakPassword(reasons: ("length" | "characters" | "pwned")[], message = PWNED_MESSAGE) {
  return new AuthWeakPasswordError(message, 422, reasons);
}

function apiError(message: string, code?: string) {
  return new AuthApiError(message, 400, code);
}

const SIGNED_IN = { data: { session: { user: { email: "ah-ming@example.com" } } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(SIGNED_IN);
  mockSignInWithPassword.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

describe("a password refused for having leaked", () => {
  it("is named as leaked on sign-up, not reported as a generic failure", async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: weakPassword(["pwned"]) });

    const res = await signUpWithEmail("ah-ming@example.com", "Password123!");

    expect(res.ok).toBe(false);
    // "unknown" is what the old prose matching produced, and it renders as "Something went wrong".
    expect(res.error).toBe("leaked_password");
  });

  it("is named as leaked when setting a new password from a recovery link", async () => {
    mockUpdateUser.mockResolvedValue({ error: weakPassword(["pwned"]) });

    const res = await setNewPassword("Password123!");

    expect(res.error).toBe("leaked_password");
  });

  it("is named as leaked when changing the password from settings", async () => {
    mockUpdateUser.mockResolvedValue({ error: weakPassword(["pwned"]) });

    const res = await changePassword("OldPassw0rd!", "Password123!");

    expect(res.error).toBe("leaked_password");
  });

  it("does not leave the password changed when it was refused", async () => {
    mockUpdateUser.mockResolvedValue({ error: weakPassword(["pwned"]) });

    await changePassword("OldPassw0rd!", "Password123!");

    // revokeOtherSessions runs only after a successful change. Signing other devices out here would
    // punish the user for a failed attempt.
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("reads the reason rather than the message, so a GoTrue rewording cannot break it", async () => {
    // Same refusal, completely different prose. Nothing here matches any substring classify knows.
    mockSignUp.mockResolvedValue({
      data: {},
      error: weakPassword(["pwned"], "This credential appears in a known breach corpus."),
    });

    const res = await signUpWithEmail("ah-ming@example.com", "Password123!");

    expect(res.error).toBe("leaked_password");
  });
});

describe("a password refused for missing the composition policy", () => {
  it.each([[["length"]], [["characters"]], [["length", "characters"]]] as const)(
    "stays weak_password for reasons %j, where the character advice is correct",
    async (reasons) => {
      mockSignUp.mockResolvedValue({
        data: {},
        error: weakPassword([...reasons], "Password should be at least 8 characters."),
      });

      const res = await signUpWithEmail("ah-ming@example.com", "short"); // pragma: allowlist secret

      expect(res.error).toBe("weak_password");
    },
  );

  it("treats a refusal that is BOTH a policy miss and a leak as a leak", async () => {
    // Fixing the composition would not make this password acceptable, so the leak is the thing
    // worth saying. Advising on character classes here would send the user round a loop.
    mockSignUp.mockResolvedValue({ data: {}, error: weakPassword(["characters", "pwned"]) });

    const res = await signUpWithEmail("ah-ming@example.com", "password123"); // pragma: allowlist secret

    expect(res.error).toBe("leaked_password");
  });

  it("falls back to weak_password when the reasons array is empty", async () => {
    // auth-js passes `data.weak_password?.reasons || []`, so an empty array is reachable. With
    // nothing to distinguish, the composition advice is the safer of the two.
    mockSignUp.mockResolvedValue({ data: {}, error: weakPassword([]) });

    const res = await signUpWithEmail("ah-ming@example.com", "whatever"); // pragma: allowlist secret

    expect(res.error).toBe("weak_password");
  });
});

describe("the two refusals say different things to the user", () => {
  it("routes a leak to its own copy", () => {
    expect(authErrorKey("leaked_password")).toBe("auth.errPasswordLeaked");
    expect(authErrorKey("leaked_password")).not.toBe(authErrorKey("weak_password"));
  });

  // Typed structurally rather than cast: this is the assertion that the key exists in BOTH bundles,
  // so it should fail to compile if either locale drops it, not fail at runtime.
  it.each<[string, { auth: { errPasswordLeaked: string; errPasswordWeak: string } }]>([
    ["en", en],
    ["zh-Hant", zhHant],
  ])("has non-empty %s copy for both", (_locale, bundle) => {
    expect(bundle.auth.errPasswordLeaked.trim()).toBeTruthy();
    expect(bundle.auth.errPasswordWeak.trim()).toBeTruthy();
    expect(bundle.auth.errPasswordLeaked).not.toBe(bundle.auth.errPasswordWeak);
  });

  it("does not repeat the character-class advice in the leaked message", () => {
    // The bug this whole file exists for: Password123! satisfies every rule listed in
    // errPasswordWeak, so repeating that advice tells the user to do what they already did.
    expect(en.auth.errPasswordLeaked.toLowerCase()).not.toContain("uppercase");
    expect(en.auth.errPasswordLeaked.toLowerCase()).not.toContain("symbol");
    expect(en.auth.errPasswordWeak.toLowerCase()).toContain("uppercase");
  });
});

describe("classify still reads the message when there is no code", () => {
  // The prose matching is now a fallback, not the primary path, so it must still work for the
  // errors GoTrue does not give a code to.
  it.each([
    ["Invalid login credentials", "invalid_credentials"],
    ["User already registered", "already_registered"],
    ["Email not confirmed", "not_confirmed"],
    ["For security purposes, you can only request this after 51 seconds.", "rate_limited"],
    ["New password should be different from the old password.", "same_password"],
    ["Something nobody has seen before", "unknown"],
  ])("maps %j to %j", async (message, expected) => {
    mockSignUp.mockResolvedValue({ data: {}, error: apiError(message) });

    const res = await signUpWithEmail("ah-ming@example.com", "Passw0rd!");

    expect(res.error).toBe(expected);
  });
});

describe("changePassword's verification step reports what actually happened", () => {
  it("still calls a genuinely wrong current password wrong", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: apiError("Invalid login credentials") });

    const res = await changePassword("not-my-password", "Passw0rd!");

    expect(res.error).toBe("invalid_credentials");
    // The password must not have been touched after a failed verification.
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not tell a throttled user their correct password is wrong", async () => {
    // The regression this replaces: rate_limited was flattened into invalid_credentials, so the
    // user retyped the right password and got throttled harder for it.
    mockSignInWithPassword.mockResolvedValue({
      error: apiError("For security purposes, you can only request this after 51 seconds."),
    });

    const res = await changePassword("OldPassw0rd!", "Passw0rd!");

    expect(res.error).toBe("rate_limited");
  });

  it("does not let an outage masquerade as a wrong password", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: apiError("upstream connect error") });

    const res = await changePassword("OldPassw0rd!", "Passw0rd!");

    expect(res.error).toBe("unknown");
  });

  it("passes a leaked CURRENT password through instead of denying the change", async () => {
    // If verification ever refuses because the current password itself has leaked, that user is on
    // this screen to fix precisely that. "Incorrect email or password" would be both false and a
    // dead end.
    mockSignInWithPassword.mockResolvedValue({ error: weakPassword(["pwned"]) });

    const res = await changePassword("Password123!", "Fresh0ne!x");

    expect(res.error).toBe("leaked_password");
  });
});
