// Guard for the message the user actually reads when an AI call is refused.
//
// The AI Edge Functions sit behind a per-user daily cap that answers 429. Before this classifier
// existed, every refusal collapsed into one "unavailable" banner: "check your connection and try
// again". For a capped user that sentence is wrong twice — their connection is fine, and trying
// again cannot work until midnight. It also invites the retry loop the cap exists to stop.
//
// The rule this file enforces, in both directions:
//   - a 429 is reported as the cap, with its numbers intact
//   - anything NOT positively identifiable as the cap stays "unavailable"
//
// The second half matters more than the first. Guessing "rate_limited" on an ambiguous failure
// tells someone they are out of estimates when the service was merely down for a second, and sends
// them away for the rest of the day for no reason.

import { classifyInvokeError, rateLimitDetail } from "@/services/functionError";

/** A FunctionsHttpError as supabase-js builds it: the raw Response hangs off `context`. */
function httpError(status: number, body: unknown): unknown {
  return { context: new Response(JSON.stringify(body), { status }) };
}

describe("classifyInvokeError", () => {
  it("reports a 429 from the quota gate as the cap", async () => {
    const err = httpError(429, { error: "rate_limited", used: 51, limit: 50, retryAfter: 3600 });
    expect(await classifyInvokeError(err)).toBe("rate_limited");
  });

  it("reports a 503 from a failing counter as unavailable, not the cap", async () => {
    // enforceAiQuota fails closed when it cannot reach the counter. That is an outage, and the
    // user should be told to try again, not sent away until tomorrow.
    const err = httpError(503, { error: "quota_unavailable" });
    expect(await classifyInvokeError(err)).toBe("unavailable");
  });

  it("reports an auth rejection as unavailable", async () => {
    expect(await classifyInvokeError(httpError(401, { error: "unauthorized" }))).toBe("unavailable");
  });

  it("reports an upstream Vertex failure as unavailable", async () => {
    expect(await classifyInvokeError(httpError(502, { error: "proxy_error" }))).toBe("unavailable");
  });

  it("does not mistake a network error with no context for the cap", async () => {
    expect(await classifyInvokeError(new TypeError("Network request failed"))).toBe("unavailable");
    expect(await classifyInvokeError(undefined)).toBe("unavailable");
    expect(await classifyInvokeError({})).toBe("unavailable");
  });

  it("still identifies the cap when the body is unreadable", async () => {
    // Status alone is sufficient. A truncated or non-JSON body must not downgrade a real 429 into
    // "try again", which would send the user straight back into the wall.
    const err = { context: new Response("<html>gateway</html>", { status: 429 }) };
    expect(await classifyInvokeError(err)).toBe("rate_limited");
  });
});

describe("rateLimitDetail", () => {
  it("returns the numbers the banner may want to show", async () => {
    const err = httpError(429, { error: "rate_limited", used: 51, limit: 50, retryAfter: 3600 });
    expect(await rateLimitDetail(err)).toEqual({ used: 51, limit: 50, retryAfter: 3600 });
  });

  it("returns null for a failure that was not the cap", async () => {
    expect(await rateLimitDetail(httpError(500, { error: "not_configured" }))).toBeNull();
  });

  it("coerces missing or nonsensical numbers to 0 rather than NaN", async () => {
    // The body is server-controlled, but a partial deploy or a proxy rewriting the payload should
    // degrade to a message without numbers, never to "NaN of NaN used".
    const err = { context: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }) };
    expect(await rateLimitDetail(err)).toEqual({ used: 0, limit: 0, retryAfter: 0 });
  });

  it("leaves the response body readable for the caller", async () => {
    // rateLimitDetail clones before reading. If it consumed the original, a caller that also wants
    // the body would get a "body already read" throw.
    const res = new Response(JSON.stringify({ error: "rate_limited", used: 5 }), { status: 429 });
    await rateLimitDetail({ context: res });
    await expect(res.json()).resolves.toMatchObject({ error: "rate_limited" });
  });
});
