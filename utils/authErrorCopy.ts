import type { AuthOutcome } from "@/services/authService";

// The one place machine error codes turn into i18n keys.
//
// Validation and the auth service both speak in codes, never in sentences: `password_weak`,
// `invalid_credentials`. That is what lets the schemas be unit tested and the service stay
// language-agnostic. The translation happens here, once, so five auth screens cannot drift into
// five different phrasings of the same failure — or worse, one screen quietly falling through to
// "Something went wrong" for a case another screen explains properly.
//
// Both functions total: an unrecognised code resolves to the generic message rather than rendering
// a raw key like "password_unchanged" into the UI.

/** zod message keys (utils/passwordSchema, utils/passwordChangeSchema) -> i18n keys. */
const FIELD_ERROR_KEYS: Record<string, string> = {
  email_invalid: "auth.errEmailInvalid",
  password_required: "auth.errPasswordRequired",
  password_weak: "auth.errPasswordWeak",
  password_mismatch: "auth.errPasswordMismatch",
  password_unchanged: "auth.errPasswordUnchanged",
};

/** Map a zod issue message to the i18n key a screen should render. */
export function fieldErrorKey(message: string | undefined): string | null {
  if (!message) return null;
  return FIELD_ERROR_KEYS[message] ?? "auth.errGeneric";
}

/** Map an AuthOutcome error code to the i18n key a screen should render. */
export function authErrorKey(error: AuthOutcome["error"]): string {
  switch (error) {
    case "invalid_credentials":
      return "auth.errInvalidCredentials";
    case "already_registered":
      return "auth.errAlreadyRegistered";
    case "not_confirmed":
      return "auth.errNotConfirmed";
    case "unavailable":
      return "auth.errUnavailable";
    case "no_password":
      return "auth.errNoPassword";
    case "same_password":
      return "auth.errPasswordUnchanged";
    case "weak_password":
      return "auth.errPasswordWeak";
    // Deliberately NOT errPasswordWeak. That message lists the composition rules, and a leaked
    // password has already met every one of them — the sign-up checklist is showing five green
    // ticks while the server refuses it. See weakPasswordReason() in services/authService.
    case "leaked_password":
      return "auth.errPasswordLeaked";
    case "rate_limited":
      return "auth.errRateLimited";
    default:
      return "auth.errGeneric";
  }
}
