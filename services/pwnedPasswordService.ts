import * as Crypto from "expo-crypto";

/**
 * Ask HaveIBeenPwned whether a password appears in a known breach, without telling it the password.
 *
 * WHY THIS EXISTS
 *
 * The composition rules in utils/passwordSchema (12 characters, upper, lower, digit, symbol) defend
 * against someone GUESSING a password. They do nothing against someone REPLAYING one, and replay is
 * the attack that actually empties accounts. `Password123!` satisfies every rule we have — it is
 * twelve characters with all four classes, so the sign-up checklist shows five green ticks — and the
 * corpus has it at 295,389 sightings. No strength rule can see that. Only a list can.
 *
 * Supabase implements exactly this as "leaked password protection", and it is Pro-plan only. The
 * underlying corpus is not: HaveIBeenPwned's range API is free, needs no key, and no account. So
 * this is the same check, run from the client.
 *
 * WHAT IS SENT
 *
 * The password never leaves the device, and neither does its full hash. The API is built on
 * k-anonymity:
 *
 *   1. SHA-1 the password locally.
 *   2. Send the FIRST FIVE hex characters of the hash. Nothing else.
 *   3. The server returns every hash it holds under that prefix, and the suffix comparison happens
 *      here, on the device.
 *
 * Five hex characters is 20 bits, so one prefix is shared by every hash in a 1,048,576th of the
 * corpus. Measured against the live API in August 2026, that is between about 1,950 and 2,500
 * hashes per prefix. The server cannot tell which of those the question was about, nor whether the
 * answer turned out to be a hit. SHA-1's brokenness is not a weakness here: it is the corpus's index
 * rather than a secrecy measure, and the value is truncated to 20 bits before it is sent.
 *
 * It is still a third-party request made on the user's behalf, so it belongs in the privacy policy.
 *
 * WHAT THIS IS NOT
 *
 * It is not enforcement. It runs on the client, so anything talking to the Supabase API directly
 * skips it entirely; only the server-side Pro toggle can actually refuse a breached password. What
 * it does is stop a user who is trying to pick a good password from unknowingly picking one that is
 * already on every attacker's list — which is the case this protects, and it is the common one.
 *
 * It also fails OPEN, deliberately. See below.
 */

// The prefix length the whole scheme is built on. Not a tunable: the endpoint is defined in terms of
// five characters, and sending more would narrow the anonymity set that is the point of using it.
const PREFIX_LENGTH = 5;

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";

// A short budget on purpose. This check sits in front of a button the user has just tapped, and its
// answer is advisory — so waiting fifteen seconds to maybe refuse a password is worse for them than
// letting a rare breached one through. Compare FETCH_TIMEOUT_MS in urlScrapeService, which is 15s
// because the user there is waiting for the result itself rather than for permission to continue.
const TIMEOUT_MS = 3500;

/**
 * True only when the password is KNOWN to have been breached.
 *
 * Every failure path returns false, and that is the deliberate choice rather than an oversight. This
 * check is a warning, not a gate: an outage at HaveIBeenPwned, a captive-portal wifi, a plane, or a
 * flaky mobile signal must never be able to stop someone creating an account or changing a password
 * they have every right to change. Failing closed would convert a third party's downtime into our
 * sign-up form being broken, and would be a far worse bug than the one being prevented.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    // expo-crypto returns hex; the case is not documented as stable, and the API answers in
    // uppercase, so both sides are normalised rather than trusted.
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, password);
    const hash = digest.toUpperCase();
    const body = await fetchRange(hash.slice(0, PREFIX_LENGTH));
    return body === null ? false : suffixIsListed(body, hash.slice(PREFIX_LENGTH));
  } catch {
    // Digest unavailable (an environment without the native module) or anything else unforeseen.
    return false;
  }
}

/** The raw `SUFFIX:COUNT` lines for one prefix, or null if the answer could not be obtained. */
async function fetchRange(prefix: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${RANGE_ENDPOINT}${prefix}`, {
      signal: controller.signal,
      // Mixes a random number of decoy entries into the response. Real ranges differ in size, so
      // without this the encrypted response LENGTH narrows down which prefix was asked for to
      // anyone watching the connection — quietly giving back some of what k-anonymity buys. The
      // decoys are distinguishable to us but not to an observer, and are dropped below.
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    // Timeout (AbortError), DNS failure, offline, TLS refusal.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether `suffix` appears in the response as a real entry.
 *
 * A padded response contains randomly generated hashes that are indistinguishable from real ones
 * except for their count, which is always zero. Treating one as a hit would refuse a password that
 * has never been breached at all, for no reason the user could ever discover — so a zero count is
 * read as "not present", which is what it means.
 */
function suffixIsListed(body: string, suffix: string): boolean {
  // The API separates lines with CRLF; trim rather than split on it, so an LF-only response parses.
  for (const line of body.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    if (line.slice(0, sep).trim().toUpperCase() !== suffix) continue;
    const count = Number.parseInt(line.slice(sep + 1).trim(), 10);
    // A suffix appears at most once, so the first match settles it either way.
    return Number.isFinite(count) && count > 0;
  }
  return false;
}
