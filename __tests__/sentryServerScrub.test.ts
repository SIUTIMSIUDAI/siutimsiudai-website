import { scrubServerEvent } from "../supabase/functions/_shared/sentryScrub";

describe("scrubServerEvent", () => {
  it("removes user, request, and contexts.response bodies; keeps the exception", () => {
    const ev = {
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      request: { data: { text: "一碗麵" }, headers: { authorization: "Bearer x" }, cookies: "c" },
      extra: { note: "一碗麵" },
      contexts: { response: { data: { secret: 1 } }, os: { name: "deno" } },
      exception: { values: [{ type: "Error", value: "upstream_failed" }] },
    };
    const out = scrubServerEvent(ev)!;
    expect(out.user).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect((out.contexts as Record<string, unknown>).response).toBeUndefined();
    expect((out.contexts as Record<string, unknown>).os).toBeDefined(); // non-PII context survives
    expect(out.exception).toBeDefined();
  });

  it("returns the event (never null) when there is nothing to strip", () => {
    const ev = { exception: { values: [{ type: "Error", value: "boom" }] } };
    expect(scrubServerEvent(ev)).toBe(ev);
  });

  it("reduces a Vertex exception value to its safe code token", () => {
    const ev = {
      exception: { values: [{ type: "Error", value: 'bad_model_json unparseable len=500 tail={"a":1' }] },
    };
    const out = scrubServerEvent(ev)!;
    expect((out.exception as { values: Array<{ value: string }> }).values[0].value).toBe("bad_model_json");
  });

  it("reduces an upstream_failed value carrying model payload to the bare code", () => {
    const ev = {
      exception: { values: [{ value: 'upstream_failed http=500 model=gemini {"candidates":[{"content":"一碗麵"}]}' }] },
    };
    const out = scrubServerEvent(ev)!;
    const value = (out.exception as { values: Array<{ value: string }> }).values[0].value;
    expect(value).toBe("upstream_failed");
    expect(value).not.toContain("一碗麵");
  });

  it("collapses an unknown DB error (which may quote an email) to 'unclassified'", () => {
    const ev = {
      exception: { values: [{ value: "duplicate key value violates unique constraint: a@b.com" }] },
    };
    const out = scrubServerEvent(ev)!;
    const value = (out.exception as { values: Array<{ value: string }> }).values[0].value;
    expect(value).toBe("unclassified");
    expect(value).not.toContain("a@b.com");
  });

  it("reduces event.message to a safe token too", () => {
    const ev = { message: "auth_failed http=401 secret-detail" };
    const out = scrubServerEvent(ev)!;
    expect(out.message).toBe("auth_failed");
  });
});
