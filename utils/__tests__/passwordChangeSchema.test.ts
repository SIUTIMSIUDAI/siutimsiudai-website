import { changePasswordSchema, resetPasswordSchema } from "../passwordChangeSchema";

// Both satisfy every rule in passwordSchema, including PASSWORD_MIN_LENGTH. The `current` values
// below are deliberately weak and short: that field is shape-only, because an account created
// before the strength rule has a weak password by definition and must still be able to change it.
const STRONG = "Siumai#8888!";
const ALSO_STRONG = "Cheungfan#99";

/** The message keys a failed parse produced, so assertions read as intent rather than as zod trivia. */
function keys(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.success ? [] : (result.error?.issues.map((i) => i.message) ?? []);
}

describe("changePasswordSchema", () => {
  it("accepts a strong, confirmed, genuinely new password", () => {
    const parsed = changePasswordSchema.safeParse({
      current: "oldpass",
      next: STRONG,
      confirm: STRONG,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a legacy weak CURRENT password", () => {
    // An account made before the strong-password rule has a weak password by definition. If this
    // screen re-validated it, that user could never change it — the exact trap we must not build.
    const parsed = changePasswordSchema.safeParse({
      current: "old123",
      next: STRONG,
      confirm: STRONG,
    });
    expect(parsed.success).toBe(true);
  });

  it("requires the current password", () => {
    const parsed = changePasswordSchema.safeParse({ current: "", next: STRONG, confirm: STRONG });
    expect(keys(parsed)).toContain("password_required");
  });

  it("enforces full strength on the NEW password", () => {
    const parsed = changePasswordSchema.safeParse({
      current: "oldpass",
      next: "weakpass",
      confirm: "weakpass",
    });
    expect(keys(parsed)).toContain("password_weak");
  });

  it("rejects a new password that does not match the confirmation", () => {
    const parsed = changePasswordSchema.safeParse({
      current: "oldpass",
      next: STRONG,
      confirm: ALSO_STRONG,
    });
    expect(keys(parsed)).toContain("password_mismatch");
  });

  it("puts the mismatch error on the confirm field, not on the new password", () => {
    const parsed = changePasswordSchema.safeParse({
      current: "oldpass",
      next: STRONG,
      confirm: ALSO_STRONG,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.message === "password_mismatch");
      expect(issue?.path).toEqual(["confirm"]);
    }
  });

  it("stays quiet about the confirmation while it is still empty", () => {
    // Mid-typing: the user has filled the new password and has not reached confirm yet. Shouting
    // "does not match" at that moment is noise, not help.
    const parsed = changePasswordSchema.safeParse({ current: "oldpass", next: STRONG, confirm: "" });
    expect(keys(parsed)).not.toContain("password_mismatch");
  });

  it("rejects reusing the current password as the new one", () => {
    const parsed = changePasswordSchema.safeParse({
      current: STRONG,
      next: STRONG,
      confirm: STRONG,
    });
    expect(keys(parsed)).toContain("password_unchanged");
  });

  it("reports reuse on the new-password field", () => {
    const parsed = changePasswordSchema.safeParse({
      current: STRONG,
      next: STRONG,
      confirm: STRONG,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.message === "password_unchanged");
      expect(issue?.path).toEqual(["next"]);
    }
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a strong, confirmed password with no current password", () => {
    // The emailed recovery link already proved the user owns the address. Asking for a password
    // they came here precisely because they do not remember would defeat the flow.
    const parsed = resetPasswordSchema.safeParse({ next: STRONG, confirm: STRONG });
    expect(parsed.success).toBe(true);
  });

  it("still enforces full strength", () => {
    const parsed = resetPasswordSchema.safeParse({ next: "weakpass", confirm: "weakpass" });
    expect(keys(parsed)).toContain("password_weak");
  });

  it("still requires the confirmation to match", () => {
    const parsed = resetPasswordSchema.safeParse({ next: STRONG, confirm: ALSO_STRONG });
    expect(keys(parsed)).toContain("password_mismatch");
  });
});
