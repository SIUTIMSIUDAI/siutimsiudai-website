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
});
