// Server-side crash reporting for the Edge Functions. Errors only. Lazily initialised from the
// SENTRY_DSN secret; a missing DSN is a silent no-op (matches requireUser/vertex "not_configured"
// posture). Every path is wrapped so a Sentry fault can NEVER turn a handled error into an unhandled
// one — the worst case is "no report". Runs in the Supabase Deno runtime; excluded from the app tsconfig.
//
// The import is pinned to esm.sh to match the repo convention (see requireUser.ts). Confirm the major
// initialises cleanly on the deployed Deno runtime during Task 8; if it does not, reportServerError
// simply no-ops.
import * as Sentry from "https://esm.sh/@sentry/deno@8";
import { scrubServerEvent } from "./sentryScrub.ts";

export interface ServerErrorContext {
  fn?: string; // function name, e.g. "estimate-meal"
  code?: string; // classified error code, e.g. "upstream_failed"
  status?: number; // HTTP status returned to the client
  bucket?: "ai" | "translate" | "scrape"; // quota bucket, when known
}

let initialised = false;
let enabled = false;

function ensureInit(): void {
  if (initialised) return;
  initialised = true;
  try {
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn) return; // unconfigured -> no-op
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      environment: Deno.env.get("SENTRY_ENVIRONMENT") || "production",
      beforeSend: scrubServerEvent,
    });
    enabled = true;
  } catch {
    enabled = false;
  }
}

// Report a handled server error with ONLY coarse, non-PII context. Never throws.
export function reportServerError(err: unknown, ctx: ServerErrorContext = {}): void {
  try {
    ensureInit();
    if (!enabled) return;
    Sentry.withScope((scope: { setTag: (k: string, v: string) => void }) => {
      if (ctx.fn) scope.setTag("fn", ctx.fn);
      if (ctx.code) scope.setTag("code", ctx.code);
      if (typeof ctx.status === "number") scope.setTag("status", String(ctx.status));
      if (ctx.bucket) scope.setTag("bucket", ctx.bucket);
      Sentry.captureException(err);
    });
  } catch {
    // Reporting must never break a request.
  }
}
