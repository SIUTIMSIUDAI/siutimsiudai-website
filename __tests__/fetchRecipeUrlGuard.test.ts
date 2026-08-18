// The SSRF guard on the fetch-recipe Edge Function.
//
// That function exists so recipe imports stop going through public CORS proxies (api.allorigins.win
// and corsproxy.io), which saw every URL our users imported. Moving the fetch to our own server
// fixes that and creates a sharper problem in its place: an endpoint that fetches a URL the caller
// chose is a Server-Side Request Forgery surface. Our runtime can reach things a user cannot, and
// cloud metadata endpoints are the classic prize.
//
// isSafeUrl is the gate. It is deliberately strict, because a recipe always lives on an ordinary
// public https website, so every unusual shape can simply be refused rather than reasoned about.
// These tests are the specification: if one of them starts failing, the guard has been widened and
// somebody needs to have justified that on purpose.
//
// The function itself runs in Deno and calls Deno.serve at module scope, so it cannot be imported
// here; the rules live in their own dependency-free file for exactly that reason. The parts that
// need a live runtime (redirect re-validation, the size cap, the content-type refusal) are
// exercised on deploy, not here.

import { isSafeUrl } from "../supabase/functions/fetch-recipe/urlGuard";

describe("isSafeUrl — pages we are willing to fetch", () => {
  const allowed = [
    "https://example.com/recipes/braised-beef",
    "https://www.example.co.uk/recipe/12345",
    "https://sub.domain.example.org/a/b/c?id=7&ref=x",
    "https://example.com:443/explicit-default-port",
    "https://例子.com/食譜", // an IDN host and a non-ASCII path are both ordinary
  ];

  for (const url of allowed) {
    it(`allows ${url}`, () => {
      expect(isSafeUrl(url).ok).toBe(true);
    });
  }
});

describe("isSafeUrl — schemes that are not a public web fetch", () => {
  it("refuses http, which a network attacker could rewrite in transit", () => {
    expect(isSafeUrl("http://example.com/recipe")).toMatchObject({ ok: false, reason: "not_https" });
  });

  it("refuses file:, which would read the server's own disk", () => {
    expect(isSafeUrl("file:///etc/passwd").ok).toBe(false);
  });

  for (const url of ["data:text/html,<h1>hi", "blob:https://example.com/x", "ftp://example.com/x"]) {
    it(`refuses ${url.slice(0, 12)}...`, () => {
      expect(isSafeUrl(url).ok).toBe(false);
    });
  }

  it("refuses a string that is not a URL at all", () => {
    expect(isSafeUrl("not a url")).toMatchObject({ ok: false, reason: "malformed" });
    expect(isSafeUrl("")).toMatchObject({ ok: false, reason: "malformed" });
  });
});

describe("isSafeUrl — addresses instead of hostnames", () => {
  // Every one of these is a way of writing a loopback or link-local address. Rather than enumerate
  // the private ranges and get an edge case wrong, the guard refuses IP literals outright: there is
  // no recipe at an IP address.
  const literals = [
    "https://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data/", // AWS instance metadata
    "https://metadata.google.internal/computeMetadata/v1/", // GCP metadata
    "https://10.0.0.5/admin",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://[::1]/", // IPv6 loopback
    "https://[fd00::1]/", // IPv6 unique-local
    "https://2130706433/", // 127.0.0.1 as a decimal integer
    "https://0x7f000001/", // 127.0.0.1 in hex
    "https://0177.0.0.1/", // 127.0.0.1 in octal
    "https://8.8.8.8/",
  ];

  for (const url of literals) {
    it(`refuses ${url}`, () => {
      expect(isSafeUrl(url).ok).toBe(false);
    });
  }
});

describe("isSafeUrl — internal names", () => {
  const internal = [
    "https://localhost/recipe",
    "https://api.localhost/recipe",
    "https://printer.local/",
    "https://vault.internal/secret",
    "https://db.localdomain/",
    "https://router.home.arpa/",
    "https://kubernetes.default/api",
    "https://instance-data/latest/",
    "https://redis/", // a bare service name, as inside a container network
  ];

  for (const url of internal) {
    it(`refuses ${url}`, () => {
      expect(isSafeUrl(url).ok).toBe(false);
    });
  }

  it("refuses a hostname with no dot, which cannot be a public site", () => {
    expect(isSafeUrl("https://intranet/page")).toMatchObject({ ok: false, reason: "not_public" });
  });
});

describe("isSafeUrl — shapes used to smuggle a different target past a parser", () => {
  it("refuses credentials in the URL", () => {
    // The classic confusion: a reader skims to "example.com" and misses that the host is evil.com.
    expect(isSafeUrl("https://example.com@evil.com/")).toMatchObject({
      ok: false,
      reason: "has_credentials",
    });
    expect(isSafeUrl("https://user:pass@example.com/").ok).toBe(false);
  });

  it("refuses a non-default port, which is how internal services are reached", () => {
    expect(isSafeUrl("https://example.com:8080/")).toMatchObject({
      ok: false,
      reason: "non_default_port",
    });
    expect(isSafeUrl("https://example.com:22/").ok).toBe(false);
  });

  it("normalises a trailing-dot FQDN rather than letting it dodge a suffix check", () => {
    // "localhost." resolves the same as "localhost" but would not match a naive equality test.
    expect(isSafeUrl("https://localhost./").ok).toBe(false);
  });

  it("matches internal names case-insensitively", () => {
    expect(isSafeUrl("https://LOCALHOST/").ok).toBe(false);
    expect(isSafeUrl("https://Metadata.Google.Internal/").ok).toBe(false);
  });
});
