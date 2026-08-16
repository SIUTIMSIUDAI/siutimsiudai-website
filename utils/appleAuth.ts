/**
 * The two decisions in the native Sign in with Apple flow that are worth testing on their own,
 * pulled out of services/authService.ts so they can be exercised without the native module.
 */

/**
 * Hex-encode the random bytes that become the sign-in nonce.
 *
 * Hex rather than base64 so the value is URL- and JWT-safe with no padding or `+/` characters to
 * worry about on either side of the exchange. The padStart is the whole point: a byte below 0x10
 * renders as one character, and dropping it would silently shorten the nonce and shift every byte
 * after it, producing a value that still looks plausible and never verifies.
 */
export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Did the user dismiss the Apple sheet, rather than something going wrong?
 *
 * This matters more than it looks. Cancelling is a decision, and showing "something went wrong"
 * after a deliberate dismissal is the kind of small lie that makes an app feel broken. Apple
 * reports it as `ERR_REQUEST_CANCELED`; older runtimes surface the numeric 1001, as either a number
 * or a string depending on the bridge, so all three spellings are accepted.
 */
export function isAppleCancellation(error: unknown): boolean {
  const code = (error as { code?: string | number } | null | undefined)?.code;
  return code === "ERR_REQUEST_CANCELED" || code === 1001 || code === "1001";
}
