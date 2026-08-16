// Which sign-in methods an account actually owns.
//
// Supabase gives every user an `identities` array, one entry per linked provider. An account created
// with email + password has an "email" identity; one created through Continue with Apple or
// Continue with Google has only "apple" or "google" and NO password at all.
//
// This matters because the change-password screen verifies the current password by attempting a
// sign-in with it. For an OAuth-only account that attempt cannot succeed, and Supabase answers with
// the same "invalid credentials" it returns for a genuine typo. The user would be told their
// password is wrong when the truth is they have never had one. So the screen is not offered at all
// unless a password identity exists, and Profile explains why instead of hiding the row silently.

/** The one field of a Supabase identity this module reads. Kept structural so tests need no SDK. */
export interface ProviderIdentity {
  provider: string;
}

export const PASSWORD_PROVIDER = "email";

/**
 * True when the account can sign in with a password. Defensive about shape: `identities` is
 * optional on the Supabase user type and is absent entirely in a no-backend environment, and an
 * unknown shape must not be read as "has a password" or the change screen would offer a dead end.
 */
export function hasPasswordIdentity(identities: ProviderIdentity[] | null | undefined): boolean {
  if (!Array.isArray(identities)) return false;
  return identities.some((i) => i?.provider === PASSWORD_PROVIDER);
}

/**
 * The non-password providers on the account, for the "you sign in with Google" explanation. Returns
 * display-ready names because there are only ever two and a lookup table would be more code than
 * the thing it replaces.
 */
export function socialProviderNames(identities: ProviderIdentity[] | null | undefined): string[] {
  if (!Array.isArray(identities)) return [];
  const names: string[] = [];
  for (const identity of identities) {
    if (identity?.provider === "google" && !names.includes("Google")) names.push("Google");
    if (identity?.provider === "apple" && !names.includes("Apple")) names.push("Apple");
  }
  return names;
}
