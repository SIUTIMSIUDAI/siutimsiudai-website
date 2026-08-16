// Classify a failed supabase.functions.invoke() into something the UI can say out loud.
//
// Every AI Edge Function now sits behind two gates: requireUser (is this a real signed-in person?)
// and enforceAiQuota (have they already had their share today?). The second one refuses with 429
// and a body of { error: "rate_limited", used, limit, retryAfter }.
//
// Without this helper every refusal collapses into the same "unavailable", which tells the user the
// app is broken. That is the wrong message twice over: it is not true, and it invites exactly the
// retry loop the cap exists to stop. "You have used today's allowance" is a fact the user can act
// on; "something went wrong" is an invitation to hammer the button.
//
// supabase-js surfaces a non-2xx as a FunctionsHttpError whose `context` is the raw Response, which
// is the same shape familyService's invokeErrorReason already reads.

/** Why a live AI call did not produce an answer. */
export type InvokeFailure = "rate_limited" | "unavailable";

export interface RateLimitDetail {
  /** Calls already made today, including the refused one. */
  used: number;
  limit: number;
  /** Seconds until the allowance resets (next midnight, Hong Kong time). */
  retryAfter: number;
}

function toPositiveInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Read a failed invoke() and decide whether it was the daily cap or a genuine outage.
 *
 * Anything it cannot positively identify as a cap is reported as "unavailable". Guessing the other
 * way would tell a user they had hit a limit they had not, and leave them waiting until tomorrow
 * for a service that was merely offline for a second.
 */
export async function classifyInvokeError(error: unknown): Promise<InvokeFailure> {
  return (await rateLimitDetail(error)) ? "rate_limited" : "unavailable";
}

/**
 * The cap's numbers, or null when this failure was not the cap. Kept separate from the
 * classification so a caller that only needs to pick a message does not pay for the detail.
 */
export async function rateLimitDetail(error: unknown): Promise<RateLimitDetail | null> {
  try {
    const ctx = (error as { context?: unknown })?.context as Response | undefined;
    if (!ctx || typeof ctx.json !== "function") return null;

    // Status alone is enough to identify the cap; the body is read for the numbers. Cloning first
    // because a Response body can only be consumed once and a caller may want it too.
    const isCap = ctx.status === 429;
    const body = (await (typeof ctx.clone === "function" ? ctx.clone() : ctx).json().catch(() => null)) as
      | { error?: string; used?: unknown; limit?: unknown; retryAfter?: unknown }
      | null;

    if (!isCap && body?.error !== "rate_limited") return null;

    return {
      used: toPositiveInt(body?.used),
      limit: toPositiveInt(body?.limit),
      retryAfter: toPositiveInt(body?.retryAfter),
    };
  } catch {
    // A body we cannot read is not evidence of a cap. Fall through to "not the cap".
    return null;
  }
}
