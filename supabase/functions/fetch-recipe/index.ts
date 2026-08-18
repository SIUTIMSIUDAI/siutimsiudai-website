// Supabase Edge Function: fetch-recipe
//
// Fetches the HTML of a recipe page the user pasted and hands it back to the app, which parses the
// schema.org/Recipe JSON-LD on device (services/urlScrapeService.ts). We fetch but do not parse:
// the parser is already written and tested in the client, and keeping it there means this function
// stays a small, auditable network hop.
//
// WHAT THIS REPLACES
//
// The client used to route recipe imports through two public CORS proxies, api.allorigins.win and
// corsproxy.io, because a browser cannot fetch a recipe site directly (those sites send no
// Access-Control-Allow-Origin). That worked, and it meant every recipe URL our users imported was
// handed to a third party we have no agreement with, no privacy disclosure for, and no control
// over. A public proxy sees the URL, can log it, can modify the HTML coming back, and can vanish.
//
// SSRF: THE RISK THIS FUNCTION IS
//
// "Fetch any URL the caller names, from the server" is the textbook shape of a Server-Side Request
// Forgery. Unguarded, this endpoint would let a signed-in user read anything our Deno runtime can
// reach that they cannot: cloud metadata endpoints, private-range services, localhost. The guards
// below exist for that, not for tidiness. In order:
//
//   1. requireUser  - not an open proxy for the internet.
//   2. enforceAiQuota - a bounded number of fetches per user per day.
//   3. isSafeUrl    - https only, default port, real hostname, no IP literals, no internal names.
//   4. Manual redirects - every hop re-validated. A public host redirecting to 169.254.169.254 is
//      the standard bypass, and redirect: "follow" would walk straight into it.
//   5. HTML only    - a metadata endpoint answers JSON, so the content-type check refuses it even
//      if a hostname somehow got through.
//   6. Size cap     - the response is read in chunks and abandoned past the ceiling, so a huge or
//      endless body cannot exhaust the isolate.
//
// One honest gap: DNS rebinding. We validate the hostname, not the address it resolves to, and the
// Deno runtime here gives us no way to pin a resolved IP for the connection. Guards 5 and 6 are
// what stand behind that, which is why the content-type check refuses anything that is not HTML.
//
// Deploy:  supabase functions deploy fetch-recipe
//
// This file runs in the Supabase Deno runtime, not in the React Native bundle, so it is excluded
// from the app tsconfig (see "exclude": ["supabase"]). `Deno` is a runtime global here.

import { requireUser } from "../_shared/requireUser.ts";
import { enforceAiQuota } from "../_shared/aiQuota.ts";
// The URL rules live next door so they can be unit tested. This file cannot be: it calls
// Deno.serve at module scope. See ./urlGuard.ts.
import { isSafeUrl } from "./urlGuard.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB of HTML is a very large recipe page
const MAX_REDIRECTS = 3;

// Recipe sites gate on a browser-like agent often enough to matter, and we identify ourselves
// alongside it so an operator seeing this traffic can find out who we are.
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 SiuTimSiuDai/1.0 (+https://siutimsiudai.app)";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Read at most MAX_BYTES, then stop.
//
// Collecting the bytes and decoding once at the end, rather than decoding each chunk as it lands,
// is what keeps a multi-byte character that straddles a chunk boundary intact. The final cut at
// MAX_BYTES can still land mid-character; TextDecoder is non-fatal by default and substitutes a
// replacement character there, which is the right outcome for a page we were already truncating.
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Releases the connection whether we finished the body or walked away from it.
    await reader.cancel().catch(() => {});
  }

  const joined = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= joined.length) break;
    const slice = c.subarray(0, joined.length - offset);
    joined.set(slice, offset);
    offset += slice.byteLength;
  }
  return new TextDecoder("utf-8").decode(joined);
}

/**
 * Follow up to MAX_REDIRECTS hops by hand, re-running isSafeUrl on every Location.
 *
 * This is the whole reason redirect handling is manual. `redirect: "follow"` validates the URL we
 * asked for and nothing after it, so a site we trust could bounce us to a link-local address and
 * the fetch would happily go.
 */
async function fetchHtml(startUrl: string, signal: AbortSignal): Promise<Response> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      // Cancel the redirect's own body so the connection is not left hanging.
      await res.body?.cancel().catch(() => {});
      const next = new URL(location, current).toString();
      const check = isSafeUrl(next);
      if (!check.ok) throw new Error(`unsafe_redirect_${check.reason}`);
      current = next;
      continue;
    }

    return res;
  }

  throw new Error("too_many_redirects");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identity gate first: this must never be an open proxy. Platform verify_jwt accepts the anon key
  // that ships in the app bundle, so this is what separates a signed-in user from anyone who
  // unzipped the app. See ../_shared/requireUser.ts.
  const auth = await requireUser(req, CORS);
  if (!auth.ok) return auth.response;

  // A ceiling on how many pages one account can make us fetch in a day. Its own bucket: importing
  // recipes must not eat the Vertex allowance the user needs to photograph dinner.
  const quota = await enforceAiQuota(auth.userId, CORS, "scrape");
  if (!quota.ok) return quota.response;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) return json({ error: "bad_request" }, 400);

    const check = isSafeUrl(url.trim());
    // The reason is returned because the caller is an authenticated user of our own app who pasted
    // the URL, and "that is not an https link" is genuinely useful to them. It leaks nothing: every
    // reason is a property of the string they typed.
    if (!check.ok) return json({ error: "unsafe_url", reason: check.reason }, 400);

    const upstream = await fetchHtml(url.trim(), controller.signal);
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      return json({ error: "upstream_failed", status: upstream.status }, 502);
    }

    // HTML only. A recipe page is HTML; a cloud metadata endpoint or an internal API is JSON. This
    // is the backstop for a hostname that passed the checks but is not what it claimed to be.
    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      await upstream.body?.cancel().catch(() => {});
      return json({ error: "not_html", contentType }, 415);
    }

    const html = await readCapped(upstream);
    if (!html) return json({ error: "empty_response" }, 502);

    return json({ html }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("unsafe_redirect")) return json({ error: "unsafe_url" }, 400);
    if (message === "too_many_redirects") return json({ error: "too_many_redirects" }, 502);
    // An abort is the timeout firing. Everything else is a DNS failure, a refused connection or a
    // malformed body: all of it is "we could not read that page".
    return json({ error: "upstream_failed" }, 502);
  } finally {
    clearTimeout(timer);
  }
});
