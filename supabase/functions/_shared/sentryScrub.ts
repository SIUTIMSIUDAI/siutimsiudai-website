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
  [key: string]: unknown;
}

export function scrubServerEvent(event: SentryEventLike): SentryEventLike | null {
  delete event.user;
  delete event.request;
  delete event.extra;
  if (event.contexts && typeof event.contexts === "object") {
    delete event.contexts.response;
  }
  return event;
}
