// Is this a URL we are willing to fetch from our own server?
//
// Deliberately dependency-free, and deliberately its own file. The Edge Function next door imports
// it for real; __tests__/fetchRecipeUrlGuard.test.ts imports it to pin the rules down. index.ts
// cannot be imported by a test (it calls Deno.serve at module scope and pulls in the Deno-only
// Supabase client), and a security check nobody can test is a security check nobody can trust.
//
// WHY THE RULES ARE THIS BLUNT
//
// fetch-recipe fetches a URL its caller chose. That is Server-Side Request Forgery by construction:
// our runtime can reach things a user cannot, and cloud metadata endpoints (169.254.169.254,
// metadata.google.internal) are the standard prize. A recipe, meanwhile, always lives on an
// ordinary public https website. So anything unusual is refused rather than reasoned about. Refusing
// a strange URL costs one user one failed import; allowing the wrong one costs us the server.
//
// Widening any of this needs a reason written down next to it.

// Hostnames that never belong to a recipe site and always belong to infrastructure.
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "kubernetes.default",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"];

/**
 * True for anything that is an address rather than a name.
 *
 * We refuse ALL IP literals instead of enumerating the private ranges, because the enumeration is
 * where this normally goes wrong: 127.0.0.1 can also be written 2130706433, 0x7f000001 or
 * 0177.0.0.1, and every one of those still resolves to loopback. There is no recipe at an IP
 * address, so the whole category can go.
 */
export function isIpLiteral(hostname: string): boolean {
  // URL.hostname wraps IPv6 in brackets; a bare colon cannot appear in a hostname anyway.
  if (hostname.startsWith("[") || hostname.includes(":")) return true;
  // Pure decimal (2130706433) and hex (0x7f000001) integer forms.
  if (/^\d+$/.test(hostname)) return true;
  if (/^0[xX][0-9a-fA-F]+$/.test(hostname)) return true;
  // Dotted forms, including octal (0177.0.0.1) and hex-per-octet. The letter test keeps real
  // domains that happen to use only hex-ish letters (example: "a.cc") from being caught, while
  // still rejecting anything made purely of digits, dots and hex digits.
  return /^[0-9a-fA-FxX.]+$/.test(hostname) && /\d/.test(hostname) && !/[a-wyzA-WYZ]/.test(hostname);
}

export interface UrlCheck {
  ok: boolean;
  /** Present when ok is false. Short and machine-readable; never shown raw to a user. */
  reason?: string;
}

export function isSafeUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // http:// would let anyone on the network rewrite the page we then parse. data:, blob: and file:
  // are not network fetches at all, and file: would read this runtime's own disk.
  if (u.protocol !== "https:") return { ok: false, reason: "not_https" };

  // https://example.com@evil.com/ is a real host of evil.com. Credentials are never right here.
  if (u.username || u.password) return { ok: false, reason: "has_credentials" };

  // Default port only. A non-standard port is how an internal service gets reached.
  if (u.port && u.port !== "443") return { ok: false, reason: "non_default_port" };

  // Lower-cased for the comparisons, and the trailing dot of a fully-qualified name stripped:
  // "localhost." resolves exactly like "localhost" but would slip past a naive equality test.
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "no_host" };
  if (isIpLiteral(host)) return { ok: false, reason: "ip_literal" };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "blocked_host" };
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "internal_tld" };

  // A public site has a dot in its name. This is what catches bare service names such as the
  // "redis" or "api" a container network resolves.
  if (!host.includes(".")) return { ok: false, reason: "not_public" };

  return { ok: true };
}
