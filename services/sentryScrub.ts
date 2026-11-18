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

// Redact the two PII shapes that can surface in a free-text error message: an email address, and a
// full URL whose query string can carry diary text. The rest of the message (error type, codes) stays
// readable for crash triage.
function scrubText(s: string): string {
  return s
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/https?:\/\/\S+/g, (m) => stripUrl(m));
}

// beforeSend: strip every identity/content field, keep the exception + stack trace.
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete (event as { user?: unknown }).user;
  delete (event as { extra?: unknown }).extra;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  if (event.contexts?.response) {
    delete (event.contexts.response as { data?: unknown }).data;
  }
  // Defence in depth: app throws don't interpolate diary text today, but redact any email / URL a
  // future message or a wrapped native error might carry. The message stays otherwise readable.
  const exception = (event as { exception?: { values?: Array<{ value?: unknown }> } }).exception;
  if (exception && Array.isArray(exception.values)) {
    for (const v of exception.values) {
      if (typeof v.value === "string") v.value = scrubText(v.value);
    }
  }
  const withMessage = event as { message?: unknown };
  if (typeof withMessage.message === "string") withMessage.message = scrubText(withMessage.message);
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

// beforeBreadcrumb: console logs can echo diary content, so drop them; HTTP breadcrumbs keep only
// method + host + status; everything else loses its data and its free-text message.
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
  delete crumb.data;
  if (crumb.message) crumb.message = "[scrubbed]";
  return crumb;
}
