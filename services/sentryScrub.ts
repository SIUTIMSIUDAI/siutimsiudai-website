// Pure PII scrubbers for Sentry. Kept dependency-free at runtime (types are import-only, erased at
// build) so Jest can unit-test them without loading the native SDK. This is the load-bearing privacy
// control: nothing leaves the device that these functions have not passed. See the design spec.
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";

// Keep only protocol + host + path. Drops the query string, which can carry a meal description or id.
function stripUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[url]";
  }
}

// beforeSend: strip every identity/content field, keep the exception + stack trace.
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete (event as { user?: unknown }).user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  if (event.contexts?.response) {
    delete (event.contexts.response as { data?: unknown }).data;
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

// beforeBreadcrumb: console logs can echo diary content, so drop them; HTTP breadcrumbs keep only
// method + host + status; everything else loses its free-text message.
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;
  if (crumb.category === "xhr" || crumb.category === "fetch" || crumb.type === "http") {
    if (crumb.data) {
      const d = crumb.data as { method?: string; status_code?: number; url?: unknown };
      crumb.data = {
        method: d.method,
        status_code: d.status_code,
        url: typeof d.url === "string" ? stripUrl(d.url) : undefined,
      };
    }
    return crumb;
  }
  if (crumb.message) crumb.message = "[scrubbed]";
  return crumb;
}
