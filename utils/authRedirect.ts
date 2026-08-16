// Where a browser-based auth flow returns to, in the exact form GoTrue will accept.
//
// Supabase matches `redirect_to` against the project's allow-list by EXACT string comparison. Not a
// prefix, not an origin, not a normalised URL: the bytes have to match. That makes the shape of the
// URL we send a correctness problem rather than a cosmetic one.
//
// `Linking.createURL("/auth/callback")` does not produce that shape on native. In a standalone build
// there is no host to sit between the scheme and the path, so expo-linking assembles
// `scheme:` + `/` + `/` + `/auth/callback` and we get `siutimsiudai:///auth/callback` — three
// slashes. The allow-list holds the two-slash form, the comparison fails, and GoTrue falls back to
// the project's Site URL. The user taps "Reset password" in their email and lands on the marketing
// website with no session and no error, which is exactly what shipped in build 7.
//
// Verified against the live project with a throwaway token:
//   siutimsiudai://auth/callback   -> 303 to siutimsiudai://auth/callback
//   siutimsiudai:///auth/callback  -> 303 to https://siutimsiudai.app   (silent fallback)
//
// Four call sites depend on this being right: signup confirmation, resend confirmation, password
// recovery, and OAuth. They were all broken the same way, so they are all fixed by the same funnel.

/** Matches a scheme followed by an empty authority, e.g. the `siutimsiudai://` of `siutimsiudai:///x`. */
const HOSTLESS_SCHEME = /^([a-z][a-z0-9+.-]*):\/\/\//i;

/**
 * Reshape a deep link so it matches an allow-list entry byte for byte: collapse the empty authority
 * segment expo-linking leaves in a custom-scheme URL, then drop a trailing slash.
 *
 * http(s) and the Expo Go proxy form (`exp://10.0.0.2:8081/--/auth/callback`) already carry a real
 * host in the authority position, so the collapse never fires on them. Only the hostless
 * custom-scheme case has the extra slash to remove.
 *
 * The trailing-slash trim matters for the same reason the collapse does: `siutimsiudai://auth/callback/`
 * is a different string to the allow-list and fails identically. A scheme-only URL keeps its slashes,
 * since trimming `siutimsiudai://` would leave something that is not a URL at all.
 */
export function normaliseAuthRedirect(url: string): string {
  if (typeof url !== "string" || url.length === 0) return url;
  const collapsed = url.replace(HOSTLESS_SCHEME, "$1://");
  if (!collapsed.endsWith("/") || collapsed.endsWith("://")) return collapsed;
  return collapsed.slice(0, -1);
}

/**
 * Read a URL fragment into a plain object.
 *
 * Not optional plumbing: GoTrue's `/auth/v1/verify` redirect puts its ENTIRE answer after the `#`,
 * both the tokens on success and `error`/`error_code` on failure, and that endpoint is what the
 * emailed `{{ .ConfirmationURL }}` points at. `Linking.parse` builds on `new URL()` and reads only
 * `searchParams`, so the fragment is invisible to it and the recovery link looks like a URL that
 * carries nothing at all.
 *
 * Verified against the live project with a spent token:
 *   siutimsiudai://auth/callback#error=access_denied&error_code=otp_expired&error_description=...
 * and on success:
 *   siutimsiudai://auth/callback#access_token=...&refresh_token=...&type=recovery
 *
 * Splits on the FIRST `=` only, so a value containing one (base64 padding, an error description
 * with a query string in it) survives intact.
 */
export function parseAuthFragment(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof url !== "string") return out;
  const fragment = url.split("#")[1] ?? "";
  for (const pair of fragment.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 1) continue; // no `=`, or an empty key: nothing usable either way
    try {
      // GoTrue percent-encodes descriptions and sends spaces as `+`, so undo both.
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(
        pair.slice(eq + 1).replace(/\+/g, " "),
      );
    } catch {
      // One malformed pair must not discard the rest of the fragment.
    }
  }
  return out;
}
