import { scrubEvent, scrubBreadcrumb } from "@/services/sentryScrub";
import type { ErrorEvent, Breadcrumb } from "@sentry/react-native";

describe("scrubEvent", () => {
  it("removes all user identity", () => {
    const ev = {
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      exception: { values: [{ type: "Error", value: "boom" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect(out.user).toBeUndefined();
    expect(out.exception).toBeDefined(); // the crash itself survives
  });

  it("strips request body, headers, cookies, query string", () => {
    const ev = {
      request: {
        data: { meal: "一碗麵" },
        headers: { authorization: "Bearer secret" },
        cookies: "sb=token",
        query_string: "q=diary",
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
  });

  it("scrubs breadcrumbs attached to the event", () => {
    const ev = {
      breadcrumbs: [
        { category: "console", message: "logged 一碗麵" },
        { category: "xhr", data: { method: "POST", url: "https://x.co/estimate?text=egg", status_code: 200, body: "egg" } },
      ],
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect(out.breadcrumbs).toHaveLength(1); // console dropped
    expect((out.breadcrumbs![0].data as Record<string, unknown>).url).toBe("https://x.co/estimate");
    expect((out.breadcrumbs![0].data as Record<string, unknown>).body).toBeUndefined();
  });

  it("strips response body from contexts but keeps status_code", () => {
    const ev = {
      contexts: { response: { data: { body: "egg salad sandwich" }, status_code: 200 } },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    const resp = out.contexts?.response as Record<string, unknown> | undefined;
    expect(resp?.data).toBeUndefined();
    expect(resp?.status_code).toBe(200);
  });

  it("redacts emails in exception values but keeps the error readable", () => {
    const ev = {
      exception: { values: [{ type: "Error", value: "login failed for a@b.com during sync" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    const value = (out.exception as { values: Array<{ value: string }> }).values[0].value;
    expect(value).toBe("login failed for [email] during sync");
  });

  it("drops the query string from a URL in an exception value", () => {
    const ev = {
      exception: { values: [{ value: "request to https://api.co/estimate?text=一碗麵 failed" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    const value = (out.exception as { values: Array<{ value: string }> }).values[0].value;
    expect(value).toContain("https://api.co/estimate");
    expect(value).not.toContain("一碗麵");
  });

  it("removes event.extra entirely", () => {
    const ev = {
      extra: { diary: "一碗麵" },
      exception: { values: [{ value: "boom" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect((out as { extra?: unknown }).extra).toBeUndefined();
  });

  it("keeps device and os contexts (the disclosed non-PII fields)", () => {
    const ev = {
      contexts: { device: { model: "iPhone" }, os: { name: "iOS", version: "18" } },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect(out.contexts?.device).toBeDefined();
    expect(out.contexts?.os).toBeDefined();
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs (they echo diary text)", () => {
    expect(scrubBreadcrumb({ category: "console", message: "ate 一碗麵" } as Breadcrumb)).toBeNull();
  });

  it("keeps http method/host/status but drops body + query", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      data: { method: "POST", url: "https://api.co/v1/x?secret=1", status_code: 500, body: "payload" },
    } as unknown as Breadcrumb)!;
    const data = out.data as Record<string, unknown>;
    expect(data.method).toBe("POST");
    expect(data.status_code).toBe(500);
    expect(data.url).toBe("https://api.co/v1/x");
    expect(data.body).toBeUndefined();
  });

  it("redacts free-text messages on other breadcrumbs", () => {
    const out = scrubBreadcrumb({ category: "ui.input", message: "user typed something" } as Breadcrumb)!;
    expect(out.message).toBe("[scrubbed]");
  });

  it("drops data on non-http breadcrumbs", () => {
    const out = scrubBreadcrumb({
      category: "ui.click",
      data: { label: "一碗麵" },
      message: "tap",
    } as unknown as Breadcrumb)!;
    expect(out.data).toBeUndefined();
    expect(out.message).toBe("[scrubbed]");
  });
});
