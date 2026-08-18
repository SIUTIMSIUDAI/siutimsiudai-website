// Shared per-user daily cap for every Edge Function that spends money at Google, plus fetch-recipe,
// which spends no money but must not be usable as an unmetered relay. See BUCKETS below.
//
// WHY THIS IS NOT A GOOGLE CLOUD QUOTA
//
// gemini-2.5-flash is served under Dynamic Shared Quota, so the project has no per-model quota
// row to lower — the console lists 17 rows for us-central1 under "Generate content requests per
// minute per project per base model", none of them gemini-2.5-flash, all of them Adjustable = No.
// The full reasoning, including why a per-user cap is the better control even where a project
// quota exists, is in database/0004_ai_usage_quota.sql.
//
// WHERE IT SITS
//
// requireUser answers "is this a real signed-in person?". This answers "has that person already
// had their share today?". They are separate questions and deliberately separate helpers:
// delete-account and create-family-invite need the first and must never have the second.
//
// Order matters. This runs after requireUser (it needs a resolved user id) and before the Vertex
// call (the whole point is to not make it).
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig. `Deno` is a runtime global.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Allowances are per bucket, because the two billable back ends are not comparable.
 *
 * `ai` (Vertex/Gemini) is the expensive one and every call is a deliberate user action — a meal
 * photo, a pantry scan, a recipe generation. Generous for a real day's use, tight against abuse: a
 * heavy honest session is roughly 20, so 50 leaves room while capping what one verified account
 * can spend.
 *
 * `translate` (Cloud Translation) costs about $20 per million characters, so a recipe is a
 * rounding error, and it fires automatically from useRecipeAutoTranslate rather than on a tap.
 * Importing a stack of recipes must not eat the allowance the user needs to log dinner, hence a
 * separate and much higher ceiling.
 *
 * `scrape` (fetch-recipe) costs us no third-party money at all: it fetches a public web page. It is
 * capped anyway, for a different reason. That function makes our server fetch a URL a caller chose,
 * which is an SSRF surface however well guarded, and an uncapped one would also let one account use
 * us as a bandwidth relay. So the number here is not a budget, it is a blast radius. 100 is far
 * more recipes than a person imports in a day and small enough to be useless as a relay.
 *
 * All three are overridable per environment (`supabase secrets set AI_DAILY_LIMIT=...`) without a
 * redeploy, so the numbers can be tuned against real usage rather than guessed at once.
 */
const BUCKETS = {
  ai: { env: "AI_DAILY_LIMIT", fallback: 50 },
  translate: { env: "AI_TRANSLATE_DAILY_LIMIT", fallback: 500 },
  scrape: { env: "SCRAPE_DAILY_LIMIT", fallback: 100 },
} as const;

export type QuotaBucket = keyof typeof BUCKETS;

function dailyLimit(bucket: QuotaBucket): number {
  const { env, fallback } = BUCKETS[bucket];
  const raw = Number(Deno.env.get(env));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/**
 * Seconds until the allowance resets, i.e. until the next midnight in Hong Kong.
 *
 * Hong Kong is a fixed UTC+8 with no daylight saving, so shifting the epoch by eight hours and
 * reading UTC fields gives the exact HK wall clock. This must agree with the `at time zone
 * 'Asia/Hong_Kong'` in bump_ai_usage, or we would tell the user to come back before the counter
 * actually rolls over.
 */
function secondsUntilReset(): number {
  const hk = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const elapsed = hk.getUTCHours() * 3600 + hk.getUTCMinutes() * 60 + hk.getUTCSeconds();
  return 86400 - elapsed;
}

export interface QuotaOk {
  ok: true;
  /** Requests used today, including this one. */
  used: number;
  limit: number;
}

export interface QuotaFail {
  ok: false;
  /** Ready-to-return rejection, CORS headers already applied. */
  response: Response;
}

export type QuotaResult = QuotaOk | QuotaFail;

/**
 * Charge one request against the user's daily allowance.
 *
 * Call site, immediately after requireUser:
 *
 *     const quota = await enforceAiQuota(auth.userId, CORS);
 *     if (!quota.ok) return quota.response;
 *
 * FAILS CLOSED. If the counter cannot be reached, the request is refused rather than waved
 * through. That is the uncomfortable choice — a database wobble takes the AI features offline
 * — but this helper's only job is to stand between an anonymous internet and a billable Google
 * credential, and a gate that opens when it breaks is not a gate. requireUser already fails closed
 * on the same infrastructure, so the behaviour is at least consistent across the pair.
 */
export async function enforceAiQuota(
  userId: string,
  cors: Record<string, string>,
  bucket: QuotaBucket = "ai",
): Promise<QuotaResult> {
  const limit = dailyLimit(bucket);

  const fail = (
    error: string,
    status: number,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): QuotaFail => ({
    ok: false,
    response: new Response(JSON.stringify({ error, ...extra }), {
      status,
      headers: { ...cors, ...headers, "content-type": "application/json" },
    }),
  });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return fail("not_configured", 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Atomic increment-and-test. bump_ai_usage is SECURITY DEFINER and granted to service_role only,
  // so this is the only route to the counter; see the migration for why it is not done in two
  // statements from here.
  const { data, error } = await admin.rpc("bump_ai_usage", {
    p_user_id: userId,
    p_limit: limit,
    p_bucket: bucket,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row.allowed !== "boolean") {
    return fail("quota_unavailable", 503);
  }

  if (!row.allowed) {
    const retryAfter = secondsUntilReset();
    // `Retry-After` for well-behaved HTTP clients; the same number in the body because that is
    // what the app actually reads (supabase-js hands the client a FunctionsHttpError, and the
    // body is the part every caller already parses).
    return fail(
      "rate_limited",
      429,
      { used: row.used, limit: row.day_limit ?? limit, retryAfter },
      { "retry-after": String(retryAfter) },
    );
  }

  return { ok: true, used: row.used, limit: row.day_limit ?? limit };
}
