import { z } from "zod";
import { strongPasswordSchema } from "./passwordSchema";

// Validation for the two ways a password can be replaced. Both reuse `strongPasswordSchema` from
// passwordSchema.ts, so the strength policy has exactly one definition and a change made there
// (and mirrored in supabase/config.toml) applies everywhere at once.
//
// The two flows differ in one thing only: proof of identity.
//
//   changePasswordSchema — the user is signed in, so we demand the CURRENT password. A live session
//     is not proof of intent: a phone left unlocked on a table is a live session. Asking for the old
//     password is what stops a passer-by taking the account. Supabase does not enforce this for us
//     (secure_password_change is off), so the check happens in authService.changePassword.
//
//   resetPasswordSchema — the user arrived from an emailed recovery link, which already proved they
//     control the address. There is no current password to ask for; that is the whole point of the
//     flow. Demanding one here would lock out exactly the people it exists to rescue.
//
// Messages are machine keys, not copy. Screens map them to localized strings, the same contract
// passwordSchema.ts uses (see FIELD_ERROR_KEYS in app/auth/sign-in.tsx).

/** Keys this module can emit, beyond the ones passwordSchema already defines. */
export const PASSWORD_CHANGE_ERROR_KEYS = ["password_mismatch", "password_unchanged"] as const;

// The confirm field carries no rules of its own: it is only ever compared against the new password.
// Validating it independently would show two errors for one mistake.
const confirmField = z.string();

/**
 * The new password must not equal the old one. Checked client-side so the user gets an instant,
 * localized message on the right field; Supabase also rejects it server-side, but only after a
 * round trip and with an English string we would have to pattern-match.
 */
function attachUnchanged(next: string, current: string, ctx: z.RefinementCtx): void {
  if (next.length > 0 && next === current) {
    ctx.addIssue({ code: "custom", message: "password_unchanged", path: ["next"] });
  }
}

function attachMismatch(next: string, confirm: string, ctx: z.RefinementCtx): void {
  // Stay quiet until they have typed something, so the error appears on a real mistake rather than
  // on every empty form.
  if (confirm.length > 0 && next !== confirm) {
    ctx.addIssue({ code: "custom", message: "password_mismatch", path: ["confirm"] });
  }
}

/** Signed-in change: current password required, new password must be strong, different, confirmed. */
export const changePasswordSchema = z
  .object({
    // Shape only, exactly like signInSchema. An account created before the strong-password rule has
    // a legitimate weak current password, and re-validating it here would make the change screen
    // the one place such a user can never get through.
    current: z.string().min(1, { message: "password_required" }),
    next: strongPasswordSchema,
    confirm: confirmField,
  })
  .superRefine((v, ctx) => {
    attachUnchanged(v.next, v.current, ctx);
    attachMismatch(v.next, v.confirm, ctx);
  });

/** Recovery-link reset: no current password, because the emailed link is the proof of identity. */
export const resetPasswordSchema = z
  .object({
    next: strongPasswordSchema,
    confirm: confirmField,
  })
  .superRefine((v, ctx) => {
    attachMismatch(v.next, v.confirm, ctx);
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
