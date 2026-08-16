// Where the breach check runs, and — the part with teeth — where it must not.
//
// The dangerous failure mode of a leaked-password feature is not missing a breached password. It is
// applying the check on the wrong path and locking a legitimate user out of their own account. The
// user whose password has leaked is precisely the user who most needs to sign in and change it, and
// refusing them hands the account to whoever else holds that password. So "sign-in is never blocked"
// is asserted here as loudly as "sign-up is".
//
// Everything below drives the real authService with the breach check mocked, because these tests are
// about the wiring. The check's own behaviour — k-anonymity, padding, failing open — is covered in
// services/__tests__/pwnedPasswordService.test.ts.

const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockIsPasswordPwned = jest.fn();

jest.mock("expo-linking", () => ({
  createURL: (path: string) => `siutimsiudai://${String(path).replace(/^\/+/, "/")}`,
  parse: () => ({ queryParams: {} }),
}));

jest.mock("@/services/pwnedPasswordService", () => ({
  isPasswordPwned: (...a: unknown[]) => mockIsPasswordPwned(...a),
}));

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

import {
  changePassword,
  setNewPassword,
  signInWithEmail,
  signUpWithEmail,
} from "@/services/authService";

// Twelve characters, upper, lower, digit and symbol: it satisfies every rule in passwordSchema, so
// the sign-up checklist shows five green ticks. It is also in the breach corpus tens of thousands of
// times over. This one password is the entire reason the check exists.
const BREACHED = "Password123!";
const FRESH = "Siumai#8888!";

const SIGNED_IN = { data: { session: { user: { email: "ah-ming@example.com" } } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(SIGNED_IN);
  mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
  mockSignInWithPassword.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  // Only the one password is treated as breached, so a test that passes for the wrong reason —
  // because everything is refused — shows up as the FRESH cases failing.
  mockIsPasswordPwned.mockImplementation(async (pw: string) => pw === BREACHED);
});

describe("signing in is never blocked by a breached password", () => {
  it("lets a user with a breached password in", async () => {
    const res = await signInWithEmail("ah-ming@example.com", BREACHED);

    expect(res.ok).toBe(true);
  });

  it("does not even ask, so an outage cannot delay the sign-in screen", async () => {
    await signInWithEmail("ah-ming@example.com", BREACHED);

    expect(mockIsPasswordPwned).not.toHaveBeenCalled();
  });
});

describe("signing up", () => {
  it("refuses a breached password with the leaked code, not a generic failure", async () => {
    const res = await signUpWithEmail("ah-ming@example.com", BREACHED);

    expect(res.ok).toBe(false);
    expect(res.error).toBe("leaked_password");
  });

  it("does not create the account", async () => {
    // Caught before signUp, so there is no account left standing on a password every attacker has.
    await signUpWithEmail("ah-ming@example.com", BREACHED);

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("lets a password that is not in the corpus through", async () => {
    const res = await signUpWithEmail("ah-ming@example.com", FRESH);

    expect(res.ok).toBe(true);
    expect(mockSignUp).toHaveBeenCalled();
  });
});

describe("changing the password from settings", () => {
  it("refuses a breached new password", async () => {
    const res = await changePassword("OldPassw0rd!", BREACHED);

    expect(res.error).toBe("leaked_password");
  });

  it("leaves the old password in place when the new one is refused", async () => {
    await changePassword("OldPassw0rd!", BREACHED);

    expect(mockUpdateUser).not.toHaveBeenCalled();
    // revokeOtherSessions runs only after a successful change; signing the user's other devices out
    // over a rejected attempt would punish them for choosing badly and then being told so.
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("checks the NEW password, never the current one", async () => {
    // The current password is not ours to judge here. An account created before any of this has a
    // weak password by definition, and this screen is where it gets fixed.
    await changePassword(BREACHED, FRESH);

    expect(mockIsPasswordPwned).toHaveBeenCalledTimes(1);
    expect(mockIsPasswordPwned).toHaveBeenCalledWith(FRESH);
  });

  it("lets a user whose CURRENT password is breached complete the change", async () => {
    const res = await changePassword(BREACHED, FRESH);

    expect(res.ok).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: FRESH });
  });

  it("reports a wrong current password before it reports a breached new one", async () => {
    // Both are wrong. "Incorrect password" is the one the user can act on first, and it is also the
    // reason the hash prefix does not leave the device until the account is proven to be theirs.
    mockSignInWithPassword.mockResolvedValue({
      error: Object.assign(new Error("Invalid login credentials"), {
        message: "Invalid login credentials",
      }),
    });

    const res = await changePassword("not-my-password", BREACHED);

    expect(res.error).toBe("invalid_credentials");
    expect(mockIsPasswordPwned).not.toHaveBeenCalled();
  });
});

describe("setting a password from a recovery link", () => {
  it("refuses a breached password", async () => {
    // This user is often here BECAUSE their password was compromised. Letting them pick another one
    // from the same corpus would end the flow exactly where it started.
    const res = await setNewPassword(BREACHED);

    expect(res.error).toBe("leaked_password");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("lets a fresh password through", async () => {
    const res = await setNewPassword(FRESH);

    expect(res.ok).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: FRESH });
  });
});

describe("a check that cannot answer does not stop anyone", () => {
  // The service already fails open internally. This asserts the wiring honours that rather than
  // treating "false" as some third state.
  it("allows sign-up when the corpus is unreachable", async () => {
    mockIsPasswordPwned.mockResolvedValue(false);

    const res = await signUpWithEmail("ah-ming@example.com", BREACHED);

    expect(res.ok).toBe(true);
  });

  it("allows a password change when the corpus is unreachable", async () => {
    mockIsPasswordPwned.mockResolvedValue(false);

    const res = await changePassword("OldPassw0rd!", BREACHED);

    expect(res.ok).toBe(true);
  });
});
