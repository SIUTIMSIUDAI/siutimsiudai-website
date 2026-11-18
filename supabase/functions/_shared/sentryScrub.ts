// Pure server-side PII scrubber for Sentry (Deno). Kept free of the @sentry/deno import and of any
// Deno global at module load so it is importable by the app's Jest suite (same pattern as
// fetch-recipe/urlGuard.ts). Defence in depth: reportServerError already sends only coarse context,
// and this strips anything Sentry's Deno SDK might otherwise attach.

// Minimal structural view of a Sentry event — enough to scrub without depending on the URL-imported
// SDK types (which the app tsconfig / Jest cannot resolve).
export interface SentryEventLike {
  user?: unknown;
  request?: unknown;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  exception?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

// The only error identifiers allowed to survive into an exception value. Everything proxyError throws
// starts with one of these (see _shared/vertex.ts); a DB error from delete-account / create-family-invite
// starts with a Postgres phrase and so reduces to "unclassified". The precise code is never lost — it is
// re-attached as the scope `code` tag by reportServerError.
const SAFE_SERVER_CODES = [
  "not_configured",
  "auth_failed",
  "upstream_failed",
  "bad_model_json",
  "internal_error",
];

// Reduce a free-text error message to its leading token, but only if that token is a known-safe code.
// Anything else (a Postgres message that may quote an email, a stray sentence) collapses to
// "unclassified" so no user-derived text can ride an exception value to Sentry.
function safeCode(value: unknown): string {
  if (typeof value !== "string") return "error";
  const token = value.split(/\s+/)[0] ?? "";
  return SAFE_SERVER_CODES.includes(token) ? token : "unclassified";
}

export function scrubServerEvent(event: SentryEventLike): SentryEventLike | null {
  delete event.user;
  delete event.request;
  delete event.extra;
  if (event.contexts && typeof event.contexts === "object") {
    delete event.contexts.response;
  }
  // The leak this closes: vertex.ts interpolates model output / upstream detail into the thrown
  // Error.message, which the Deno SDK serialises into exception values. Reduce each to a safe token.
  const exception = event.exception as { values?: Array<{ value?: unknown }> } | undefined;
  if (exception && Array.isArray(exception.values)) {
    for (const v of exception.values) {
      v.value = safeCode(v.value);
    }
  }
  if (event.message !== undefined) {
    event.message = safeCode(event.message);
  }
  return event;
}
