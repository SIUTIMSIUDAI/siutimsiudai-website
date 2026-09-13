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
});
