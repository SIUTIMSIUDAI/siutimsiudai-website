import {
  checkPasswordRules,
  isPasswordStrong,
  PASSWORD_MIN_LENGTH,
  passwordRules,
  signInSchema,
  signUpSchema,
} from "../passwordSchema";
import i18n from "@/i18n";
import en from "@/i18n/en.json";
import zhHant from "@/i18n/zh-Hant.json";

// A password that satisfies every rule: >= PASSWORD_MIN_LENGTH chars, upper, lower, digit, symbol.
const STRONG = "Siumai#8888!";

// Every fixture below is deliberately long enough to clear the length rule, so a test named for a
// missing character class fails on that class alone. Fixtures that were merely 8 or 9 characters
// would still be rejected after the minimum rose to 12, and would have gone on "passing" while
// testing nothing they claimed to.

describe("password rules", () => {
  it("accepts a password that meets every requirement", () => {
    expect(isPasswordStrong(STRONG)).toBe(true);
    expect(checkPasswordRules(STRONG).every((r) => r.met)).toBe(true);
  });

  it("requires at least the minimum length", () => {
    // "Ab3$" has all four classes but is too short, so length is enforced independently.
    expect(passwordRules.length("Ab3$")).toBe(false);
    expect(isPasswordStrong("Ab3$")).toBe(false);
    // Pinned so raising the policy is a deliberate edit rather than a drive-by. The same number is
    // mirrored in supabase/config.toml and in the hosted project's dashboard Auth settings.
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    // One character short of the minimum, with all four classes present, is still refused.
    expect(isPasswordStrong("Siumai#888!")).toBe(false);
  });

  it("rejects when any single character class is missing", () => {
    expect(isPasswordStrong("siumai#8888!")).toBe(false); // no uppercase
    expect(isPasswordStrong("SIUMAI#8888!")).toBe(false); // no lowercase
    expect(isPasswordStrong("Siumaiii#aa!")).toBe(false); // no number
    expect(isPasswordStrong("Siumai888888")).toBe(false); // no symbol (all alnum)
  });

  it("reports the exact rule that fails, in display order", () => {
    const rules = checkPasswordRules("siumai888888"); // long enough, missing upper + symbol
    const byKey = Object.fromEntries(rules.map((r) => [r.key, r.met]));
    expect(byKey.length).toBe(true);
    expect(byKey.lower).toBe(true);
    expect(byKey.number).toBe(true);
    expect(byKey.upper).toBe(false);
    expect(byKey.symbol).toBe(false);
    expect(rules.map((r) => r.key)).toEqual(["length", "upper", "lower", "number", "symbol"]);
  });
});

describe("the UI copy tracks the constant", () => {
  // The minimum used to be written out as a literal "8" in four separate strings. Raising the rule
  // without editing all four would leave the checklist promising a minimum the form no longer
  // accepts — the user reads "at least 8 characters", types 11, and is refused with no clue why.
  // Both strings now interpolate {{passwordMin}}, supplied to i18next as a defaultVariable in
  // i18n/index.ts, so there is exactly one number to change.
  const COPY_KEYS = ["pwRuleLength", "errPasswordWeak"] as const;

  it.each([
    ["en", en],
    ["zh-Hant", zhHant],
  ])("interpolates the minimum in %s rather than baking it in", (_locale, bundle) => {
    for (const key of COPY_KEYS) {
      const copy = bundle.auth[key];
      expect(copy).toContain("{{passwordMin}}");
      // No stray digits: a leftover "8" beside the placeholder would be the drift this prevents.
      expect(copy.replace("{{passwordMin}}", "")).not.toMatch(/\d/);
    }
  });

  it("actually renders the number, rather than shipping the placeholder to the screen", () => {
    // The assertion above only proves the template is right. If defaultVariables ever stops being
    // applied, every one of those keys renders a literal "{{passwordMin}}" in the UI — a worse bug
    // than the drift it replaced, and invisible to a test that only reads the JSON.
    for (const key of COPY_KEYS) {
      const rendered = i18n.t(`auth.${key}`);
      expect(rendered).toContain(String(PASSWORD_MIN_LENGTH));
      expect(rendered).not.toContain("{{");
    }
  });
});

describe("signUpSchema", () => {
  it("passes a valid email + strong password and trims the email", () => {
    const parsed = signUpSchema.safeParse({ email: "  boss@siutimsiudai.app ", password: STRONG });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("boss@siutimsiudai.app");
  });

  it("flags a weak password with the password_weak key", () => {
    const parsed = signUpSchema.safeParse({ email: "boss@siutimsiudai.app", password: "weakpass" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message === "password_weak")).toBe(true);
    }
  });

  it("flags an invalid email with the email_invalid key", () => {
    const parsed = signUpSchema.safeParse({ email: "not-an-email", password: STRONG });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message === "email_invalid")).toBe(true);
    }
  });
});

describe("signInSchema", () => {
  it("accepts a legacy (weak) password so returning users are never locked out", () => {
    const parsed = signInSchema.safeParse({ email: "boss@siutimsiudai.app", password: "old123" });
    expect(parsed.success).toBe(true);
  });

  it("still requires a non-empty password", () => {
    const parsed = signInSchema.safeParse({ email: "boss@siutimsiudai.app", password: "" });
    expect(parsed.success).toBe(false);
  });
});
