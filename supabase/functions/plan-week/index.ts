// Supabase Edge Function: plan-week
//
// The weekly family meal plan (Max). Writes plans and dishes with the service role; the app only
// ever reads them (database/0012_max_household.sql). Request modes, all from the family's manager:
//   - { mode: "setup" } makes sure a Max user planning alone has a family to save settings into
//     (find-or-create, as create-family-invite does). No AI.
// The rest spend AI and answer { ok: true, planId } for the app to re-read the plan:
//   - { mode: "generate", weekStart, pantry } plans this week (from today) or next week. Once per
//     family per week: the plan row is claimed before any AI is spent, and its unique key is the limit.
//     Two steps: one call names every dish for the week (so the week varies), then one call per day
//     writes those dishes out in full, side by side.
//   - { mode: "regenerate_day", planId, date, pantry } replaces a day's dishes, keeping locked ones
//     and any already logged with 食咗.
//   - { mode: "swap", planId, dishId, pantry } replaces one dish.
//   - { mode: "translate", planId, language } puts the plan's dishes into the helper's language (fil
//     or id) for helper mode, cached on each dish. Any member of the family may ask for their own
//     language; the Max checked is the family's (its owner's), so a helper on Free still gets it.
// Swaps and day regenerations share REGEN_LIMIT per plan week, counted only once one succeeds
// (filling a day the first generation left empty is free). Every AI call also counts against the
// caller's daily allowance (../_shared/aiQuota.ts).
//
// The prompts and the checks on what comes back are in ./plan.ts, which the app's Jest suite tests.
// Exclusions (allergies included) go to the model as "never use" and are checked again on the way
// back: a dish naming one is dropped.
//
// Deploy:  supabase functions deploy plan-week
// Secrets: REVENUECAT_SECRET_KEY (as create-family-invite) and the Vertex ones (as generate-recipe).
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig. `Deno` is a runtime global.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, extractJson, json, proxyError, vertexGenerateContent } from "../_shared/vertex.ts";
import { requireUser } from "../_shared/requireUser.ts";
import { enforceAiQuota } from "../_shared/aiQuota.ts";
import { hasActiveMax } from "../_shared/maxEntitlement.ts";
import { ensureOwnGroup } from "../_shared/familyGroup.ts";
import {
  type CheckedDish,
  type Slot,
  PLAN_SYSTEM_PROMPT,
  REGEN_LIMIT,
  dayPrompt,
  daysToPlan,
  exclusionList,
  hkToday,
  outlinePrompt,
  pickDayDishes,
  pickOutline,
  planSlots,
  targetWeek,
} from "./plan.ts";
import {
  TRANSLATE_BATCH,
  TRANSLATE_SYSTEM_PROMPT,
  batches,
  dishToTranslate,
  pickTranslations,
  translateLanguage,
  translatePrompt,
} from "./translate.ts";

const MODEL = Deno.env.get("VERTEX_MODEL") || "gemini-2.5-flash";
// A full bilingual dish is about 1,000 to 1,300 output tokens; 4,096 per dish is generate-recipe's budget.
const TOKENS_PER_DISH = 4096;

type Admin = SupabaseClient;

interface DishRow {
  id: string;
  plan_date: string;
  slot: Slot;
  locked: boolean;
  logged_at: string | null;
  recipe: { title?: string; titleZh?: string };
}

const recipeJson = (d: CheckedDish) => ({
  title: d.title,
  titleZh: d.titleZh,
  totalMinutes: d.totalMinutes,
  ingredients: d.ingredients,
  steps: d.steps,
  perServing: d.perServing,
});

const titleOf = (r: DishRow["recipe"]) => [r?.title, r?.titleZh].filter(Boolean).join(" / ");

// What the model is told never to use: every member's own list. Read with the service role, because
// no member can read another's (see the migration).
async function familyInputs(admin: Admin, groupId: string): Promise<{ slots: Slot[]; exclusions: string[] }> {
  const [{ data: settings }, { data: members }] = await Promise.all([
    admin.from("family_plan_settings").select("slots").eq("group_id", groupId).maybeSingle(),
    admin.from("family_member_settings").select("exclusions").eq("group_id", groupId),
  ]);
  return {
    slots: planSlots(settings?.slots),
    exclusions: exclusionList((members ?? []).map((m: { exclusions: unknown }) => m.exclusions)),
  };
}

async function generateDay(input: Parameters<typeof dayPrompt>[0], slots: Slot[], exclusions: string[]) {
  const text = await vertexGenerateContent(MODEL, {
    system: PLAN_SYSTEM_PROMPT,
    parts: [{ text: dayPrompt(input) }],
    maxOutputTokens: TOKENS_PER_DISH * slots.length,
  });
  return pickDayDishes(extractJson(text), slots, exclusions);
}

// Charge one AI use per model call, before making it.
async function chargeAi(uid: string, calls: number): Promise<Response | null> {
  for (let i = 0; i < calls; i++) {
    const quota = await enforceAiQuota(uid, CORS);
    if (!quota.ok) return quota.response;
  }
  return null;
}

async function generate(admin: Admin, uid: string, body: Record<string, unknown>): Promise<Response> {
  const today = hkToday(Date.now());
  const weekStart = targetWeek(body.weekStart, today);
  if (!weekStart) return json({ error: "bad_request" }, 400);
  const days = daysToPlan(weekStart, today);

  const group = await ensureOwnGroup(admin, uid);
  if (!group) return json({ error: "insert_failed" }, 500);

  // Claim the week first. Its unique key is the once-a-week limit, and claiming before the AI runs
  // means two quick taps can't both pay for a generation.
  const { data: claimed, error: claimErr } = await admin
    .from("family_week_plans")
    .insert({ group_id: group.groupId, week_start: weekStart, generated_by: uid })
    .select("id")
    .single();
  if (claimErr || !claimed) {
    if (claimErr?.code === "23505") return json({ error: "already_generated" }, 409);
    throw new Error(`insert_failed ${claimErr?.message ?? ""}`);
  }
  const planId = claimed.id as string;
  // Nothing was planned after all: give the week back so they can try again.
  const release = () => admin.from("family_week_plans").delete().eq("id", planId);

  try {
    const { slots, exclusions } = await familyInputs(admin, group.groupId);
    const refused = await chargeAi(uid, 1 + days.length);
    if (refused) {
      await release();
      return refused;
    }

    const outlineText = await vertexGenerateContent(MODEL, {
      system: PLAN_SYSTEM_PROMPT,
      parts: [{ text: outlinePrompt({ days, slots, pantry: body.pantry, exclusions }) }],
      maxOutputTokens: 4096,
    });
    const outline = pickOutline(extractJson(outlineText), days, slots);
    const allTitles = Array.from(outline.values()).map((o) => `${o.title} / ${o.titleZh}`);

    const results = await Promise.allSettled(
      days.map((date) => {
        const planned = slots.map((s) => outline.get(`${date}|${s}`)).filter((o) => !!o) as Array<{
          slot: Slot;
          title: string;
          titleZh: string;
        }>;
        // A day the outline missed is planned afresh, steering clear of the rest of the week.
        const complete = planned.length === slots.length;
        return generateDay(
          { date, slots, outline: complete ? planned : null, pantry: body.pantry, exclusions, avoid: complete ? [] : allTitles },
          slots,
          exclusions,
        ).then((dishes) => ({ date, dishes }));
      }),
    );

    const rows = results.flatMap((r) =>
      r.status === "fulfilled"
        ? r.value.dishes.map((d) => ({
            plan_id: planId,
            group_id: group.groupId,
            plan_date: r.value.date,
            slot: d.slot,
            recipe: recipeJson(d),
          }))
        : [],
    );
    console.log(JSON.stringify({ fn: "plan-week", mode: "generate", calls: 1 + days.length, dishes: rows.length }));
    if (rows.length === 0) throw new Error("upstream_failed no_dishes");
    const { error: insErr } = await admin.from("family_plan_dishes").insert(rows);
    if (insErr) throw new Error(`insert_failed ${insErr.message}`);
    return json({ ok: true, planId }, 200);
  } catch (err) {
    await release();
    throw err;
  }
}

// The plan, if the caller runs its family. Everything after generation is the manager's to change.
async function ownedPlan(admin: Admin, uid: string, planId: unknown) {
  if (typeof planId !== "string") return null;
  const { data: plan } = await admin
    .from("family_week_plans")
    .select("id, group_id, week_start, regen_used")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return null;
  const { data: owner } = await admin.from("family_groups").select("id").eq("id", plan.group_id).eq("owner_id", uid).maybeSingle();
  return owner ? plan : null;
}

async function planDishes(admin: Admin, planId: string): Promise<DishRow[]> {
  const { data } = await admin
    .from("family_plan_dishes")
    .select("id, plan_date, slot, locked, logged_at, recipe")
    .eq("plan_id", planId);
  return (data ?? []) as DishRow[];
}

// Counts a swap or regeneration once it has worked; null means the week's allowance was already gone.
async function countRegen(admin: Admin, planId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("bump_plan_regen", { p_plan_id: planId, p_limit: REGEN_LIMIT });
  return !error && typeof data === "number";
}

async function regenerateDay(admin: Admin, uid: string, body: Record<string, unknown>): Promise<Response> {
  const plan = await ownedPlan(admin, uid, body.planId);
  if (!plan) return json({ error: "not_manager" }, 403);
  const today = hkToday(Date.now());
  const date = typeof body.date === "string" ? body.date : "";
  if (!daysToPlan(plan.week_start, today).includes(date)) return json({ error: "bad_request" }, 400);

  const { slots, exclusions } = await familyInputs(admin, plan.group_id);
  const dishes = await planDishes(admin, plan.id);
  const dayDishes = dishes.filter((d) => d.plan_date === date);
  // Locked dishes and ones already logged with 食咗 stay put.
  const kept = new Set(dayDishes.filter((d) => d.locked || d.logged_at).map((d) => d.slot));
  const target = slots.filter((s) => !kept.has(s));
  if (target.length === 0) return json({ error: "locked" }, 409);
  // Filling a day that came back empty finishes the first generation, so it doesn't count.
  const counts = dayDishes.length > 0;
  if (counts && plan.regen_used >= REGEN_LIMIT) return json({ error: "regen_limit" }, 429);

  const refused = await chargeAi(uid, 1);
  if (refused) return refused;
  const avoid = dishes.filter((d) => d.plan_date !== date || kept.has(d.slot)).map((d) => titleOf(d.recipe));
  const fresh = await generateDay({ date, slots: target, outline: null, pantry: body.pantry, exclusions, avoid }, target, exclusions);
  console.log(JSON.stringify({ fn: "plan-week", mode: "regenerate_day", calls: 1, dishes: fresh.length }));
  if (fresh.length === 0) throw new Error("upstream_failed no_dishes");
  if (counts && !(await countRegen(admin, plan.id))) return json({ error: "regen_limit" }, 429);

  const replaced = dayDishes.filter((d) => fresh.some((f) => f.slot === d.slot)).map((d) => d.id);
  if (replaced.length > 0) await admin.from("family_plan_dishes").delete().in("id", replaced);
  const { error } = await admin.from("family_plan_dishes").insert(
    fresh.map((d) => ({ plan_id: plan.id, group_id: plan.group_id, plan_date: date, slot: d.slot, recipe: recipeJson(d) })),
  );
  if (error) throw new Error(`insert_failed ${error.message}`);
  return json({ ok: true, planId: plan.id }, 200);
}

async function swap(admin: Admin, uid: string, body: Record<string, unknown>): Promise<Response> {
  const plan = await ownedPlan(admin, uid, body.planId);
  if (!plan) return json({ error: "not_manager" }, 403);
  const dishes = await planDishes(admin, plan.id);
  const dish = dishes.find((d) => d.id === body.dishId);
  if (!dish) return json({ error: "bad_request" }, 400);
  if (dish.locked || dish.logged_at) return json({ error: "locked" }, 409);
  if (dish.plan_date < hkToday(Date.now())) return json({ error: "bad_request" }, 400);
  if (plan.regen_used >= REGEN_LIMIT) return json({ error: "regen_limit" }, 429);

  const { exclusions } = await familyInputs(admin, plan.group_id);
  const refused = await chargeAi(uid, 1);
  if (refused) return refused;
  const avoid = dishes.map((d) => titleOf(d.recipe));
  const [fresh] = await generateDay(
    { date: dish.plan_date, slots: [dish.slot], outline: null, pantry: body.pantry, exclusions, avoid },
    [dish.slot],
    exclusions,
  );
  console.log(JSON.stringify({ fn: "plan-week", mode: "swap", calls: 1, dishes: fresh ? 1 : 0 }));
  if (!fresh) throw new Error("upstream_failed no_dishes");
  if (!(await countRegen(admin, plan.id))) return json({ error: "regen_limit" }, 429);

  // Same row, new recipe: the slot's portions carry over on their own (they're keyed by slot), and the
  // old dish's translations go, to be redone for the new one when helper mode next opens.
  const { error } = await admin
    .from("family_plan_dishes")
    .update({ recipe: recipeJson(fresh), translations: {} })
    .eq("id", dish.id);
  if (error) throw new Error(`insert_failed ${error.message}`);
  return json({ ok: true, planId: plan.id }, 200);
}

// Helper mode in the member's language. The caller must belong to the plan's family, and the family's
// owner must hold Max (checked with RevenueCat, failing closed). Only dishes without this language are
// sent, in small batches side by side; a batch that comes back wrong is skipped, and those dishes stay
// in English until the next try.
async function translate(admin: Admin, uid: string, rcSecret: string, body: Record<string, unknown>): Promise<Response> {
  const language = translateLanguage(body.language);
  if (!language || typeof body.planId !== "string") return json({ error: "bad_request" }, 400);
  const { data: plan } = await admin.from("family_week_plans").select("id, group_id").eq("id", body.planId).maybeSingle();
  if (!plan) return json({ error: "bad_request" }, 400);
  const [{ data: member }, { data: group }] = await Promise.all([
    admin.from("family_members").select("user_id").eq("group_id", plan.group_id).eq("user_id", uid).maybeSingle(),
    admin.from("family_groups").select("owner_id").eq("id", plan.group_id).maybeSingle(),
  ]);
  if (!member || !group) return json({ error: "not_member" }, 403);
  const maxState = await hasActiveMax(group.owner_id, rcSecret);
  if (maxState === "error") return json({ error: "verification_failed" }, 502);
  if (maxState === false) return json({ error: "max_required" }, 403);

  const { data: rows } = await admin.from("family_plan_dishes").select("id, recipe, translations").eq("plan_id", plan.id);
  const todo = ((rows ?? []) as Array<{ id: string; recipe: unknown; translations: Record<string, unknown> | null }>)
    .filter((r) => !r.translations?.[language])
    .map(dishToTranslate)
    .filter((d): d is NonNullable<ReturnType<typeof dishToTranslate>> => d !== null);
  if (todo.length === 0) return json({ ok: true, planId: plan.id }, 200);

  const groups = batches(todo, TRANSLATE_BATCH);
  const refused = await chargeAi(uid, groups.length);
  if (refused) return refused;
  const results = await Promise.allSettled(
    groups.map(async (group) => {
      const text = await vertexGenerateContent(MODEL, {
        system: TRANSLATE_SYSTEM_PROMPT,
        parts: [{ text: translatePrompt(group, language) }],
        maxOutputTokens: 1024 * group.length,
      });
      return pickTranslations(extractJson(text), group);
    }),
  );
  let saved = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const [dishId, t] of r.value) {
      const { error } = await admin.rpc("merge_dish_translation", { p_dish_id: dishId, p_language: language, p_translation: t });
      if (!error) saved += 1;
    }
  }
  console.log(JSON.stringify({ fn: "plan-week", mode: "translate", calls: groups.length, dishes: todo.length, saved }));
  if (saved === 0) throw new Error("upstream_failed no_translations");
  return json({ ok: true, planId: plan.id }, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identity first, then Max, both before any billable work. Fail closed throughout.
  const auth = await requireUser(req, CORS);
  if (!auth.ok) return auth.response;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rcSecret = Deno.env.get("REVENUECAT_SECRET_KEY");
  if (!url || !serviceKey || !rcSecret) return json({ error: "not_configured" }, 500);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Translating checks the family's Max (its owner's) itself; everything else is the planner's own.
  if (body.mode === "translate") {
    try {
      return await translate(admin, auth.userId, rcSecret, body);
    } catch (err) {
      return proxyError(err);
    }
  }
  const maxState = await hasActiveMax(auth.userId, rcSecret);
  if (maxState === "error") return json({ error: "verification_failed" }, 502);
  if (maxState === false) return json({ error: "max_required" }, 403);

  try {
    if (body.mode === "setup") {
      const group = await ensureOwnGroup(admin, auth.userId);
      return group ? json({ ok: true, groupId: group.groupId }, 200) : json({ error: "insert_failed" }, 500);
    }
    if (body.mode === "generate") return await generate(admin, auth.userId, body);
    if (body.mode === "regenerate_day") return await regenerateDay(admin, auth.userId, body);
    if (body.mode === "swap") return await swap(admin, auth.userId, body);
    return json({ error: "bad_request" }, 400);
  } catch (err) {
    return proxyError(err);
  }
});

