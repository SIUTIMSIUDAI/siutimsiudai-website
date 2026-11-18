import { isSupabaseConfigured, supabase } from "./supabase";
import {
  DEMO_FAMILY_EXCLUSIONS,
  DEMO_HELPER_ID,
  DEMO_HELPER_ME,
  DEMO_ME,
  DEMO_MEMBERS,
  DEMO_MY_USER_ID,
  demoDish,
  demoPool,
  demoWeekPlan,
} from "@/constants/demoFamilyPlan";
import { DEFAULT_PLAN_SLOTS, REGEN_LIMIT_PER_WEEK } from "@/constants/portionSizes";
import type { MealType, PantryItem } from "@/types";
import type {
  FamilyLogEntry,
  FamilyPlanSnapshot,
  HelperLanguage,
  HelperSnapshot,
  InboxEntry,
  MyPlanSettings,
  PlanFailReason,
  PlanMember,
  PlanResult,
  PortionChoice,
  PortionSize,
  ShoppingSnapshot,
  TranslatedLanguage,
  WeekPlan,
} from "@/types/familyPlan";
import { addDays, weekStartOf } from "@/utils/dateRange";
import {
  helperDishesFromRows,
  myPlanSettingsFromRow,
  planFromRows,
  portionsFromRows,
  rosterFromRows,
  shoppingSnapshotFrom,
} from "@/utils/familyPlanRows";
import { daysToPlan, inboxEntryFrom, normaliseSlots } from "@/utils/weekPlan";

/**
 * The weekly family meal plan's backend (Max). Plans and dishes are written by the plan-week Edge
 * Function, which checks Max with RevenueCat and spends the AI; everything else is a table read or a
 * small write gated by the access rules in database/0012_max_household.sql.
 *
 * With Supabase unconfigured (web preview, tests) every call runs against an in-memory demo family
 * instead (constants/demoFamilyPlan.ts), so the screens are walkable. That demo is never a fallback:
 * a live call that fails says so with a reason, and the screen shows it.
 */

const fail = <T>(reason: PlanFailReason): PlanResult<T> => ({ ok: false, reason });
const live = () => isSupabaseConfigured && !!supabase;

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// --- Demo family ---------------------------------------------------------------------------------

interface DemoState {
  /** Whose phone the demo is: Ka Yan the planner, or Maria the helper. */
  viewer: "planner" | "helper";
  slots: MealType[];
  me: MyPlanSettings;
  helperMe: MyPlanSettings;
  members: PlanMember[];
  plans: WeekPlan[];
  shopping: Record<string, ShoppingSnapshot>;
  // How far each slot has been swapped through the demo library, so a swap always changes the dish.
  turns: Record<string, number>;
}

const freshDemo = (): DemoState => ({
  viewer: "planner",
  slots: [...DEFAULT_PLAN_SLOTS],
  me: { ...DEMO_ME, exclusions: [...DEMO_ME.exclusions] },
  helperMe: { ...DEMO_HELPER_ME, exclusions: [...DEMO_HELPER_ME.exclusions] },
  members: DEMO_MEMBERS.map((m) => ({ ...m })),
  plans: [],
  shopping: {},
  turns: {},
});

let demo = freshDemo();

/** Back to an unplanned demo family. For tests and previews. */
export function resetDemoFamilyPlan(): void {
  demo = freshDemo();
}

/** Look at the demo family from the planner's phone or from Maria's (helper mode). Previews and tests. */
export function setDemoViewer(viewer: DemoState["viewer"]): void {
  demo.viewer = viewer;
}

const demoMe = () => (demo.viewer === "helper" ? demo.helperMe : demo.me);
const demoMyId = () => (demo.viewer === "helper" ? DEMO_HELPER_ID : DEMO_MY_USER_ID);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const demoExclusions = () => [...DEMO_FAMILY_EXCLUSIONS, ...demo.me.exclusions];
const demoPlan = (planId: string) => demo.plans.find((p) => p.id === planId);

// The next dish in the slot's demo pool that isn't already on that week's plan.
function demoNextDish(plan: WeekPlan, date: string, slot: MealType) {
  const key = `${plan.id}|${date}|${slot}`;
  const pool = demoPool(slot, demoExclusions());
  const onPlan = new Set(plan.dishes.map((d) => d.title));
  const current = plan.dishes.find((d) => d.date === date && d.slot === slot);
  const start = current ? pool.findIndex((d) => d.title === current.title) : -1;
  for (let step = 1; step <= pool.length; step++) {
    const index = start + step + (demo.turns[key] ?? 0);
    const candidate = pool[((index % pool.length) + pool.length) % pool.length];
    if (!onPlan.has(candidate.title)) {
      demo.turns[key] = (demo.turns[key] ?? 0) + 1;
      return demoDish(plan.id, date, slot, pool.indexOf(candidate), demoExclusions());
    }
  }
  return demoDish(plan.id, date, slot, start + 1, demoExclusions());
}

// --- Reading the plan ----------------------------------------------------------------------------

type Rows = Array<Record<string, unknown>>;

interface FamilyBase {
  uid: string;
  groupId: string;
  role: "manager" | "dependent";
  members: PlanMember[];
  slots: MealType[];
  me: MyPlanSettings;
  planRows: Rows;
  portionRows: Rows;
}

// What both views of the plan read: who's in the family, the slots, my own settings, this week's and
// next week's plans and their portions. "none" when the caller isn't in a family yet.
async function loadFamily(today: string): Promise<PlanResult<FamilyBase | "none">> {
  const db = supabase!;
  const uid = await currentUserId();
  if (!uid) return fail("unavailable");
  const [{ data: rosterRows, error: rosterErr }, { data: memberships, error: memberErr }] = await Promise.all([
    db.rpc("family_plan_roster"),
    db.from("family_members").select("group_id, role").eq("user_id", uid),
  ]);
  if (rosterErr || memberErr) return fail("unavailable");
  const mine = (memberships ?? []) as Array<{ group_id: string; role: string }>;
  const membership = mine.find((m) => m.role === "manager") ?? mine[0];
  if (!membership) return { ok: true, value: "none" };

  const groupId = membership.group_id;
  const thisWeek = weekStartOf(today);
  const [settingsRes, plansRes, meRes] = await Promise.all([
    db.from("family_plan_settings").select("slots").eq("group_id", groupId).maybeSingle(),
    db
      .from("family_week_plans")
      .select("id, week_start, generated_at, regen_used, shopping, shopping_at")
      .eq("group_id", groupId)
      .in("week_start", [thisWeek, addDays(thisWeek, 7)]),
    db
      .from("family_member_settings")
      .select("default_size, exclusions, is_helper, helper_language, log_private")
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .maybeSingle(),
  ]);
  if (settingsRes.error || plansRes.error || meRes.error) return fail("unavailable");
  const planRows = (plansRes.data ?? []) as Rows;
  let portionRows: Rows = [];
  if (planRows.length > 0) {
    const portionsRes = await db
      .from("family_plan_portions")
      .select("plan_id, plan_date, slot, user_id, choice")
      .in("plan_id", planRows.map((p) => String(p.id)));
    if (portionsRes.error) return fail("unavailable");
    portionRows = portionsRes.data ?? [];
  }
  const members = rosterFromRows((rosterRows ?? []) as Rows);
  const slots = normaliseSlots(settingsRes.data?.slots);
  return {
    ok: true,
    value: {
      uid,
      groupId,
      role: members.find((m) => m.userId === uid)?.role ?? (membership.role === "manager" ? "manager" : "dependent"),
      members,
      slots: slots.length > 0 ? slots : [...DEFAULT_PLAN_SLOTS],
      me: myPlanSettingsFromRow(meRes.data),
      planRows,
      portionRows,
    },
  };
}

/** The plan screen's data: roster, slots, this week's and next week's plans, and my own settings. */
export async function getFamilyPlan(today: string): Promise<PlanResult<FamilyPlanSnapshot>> {
  if (!live()) {
    return {
      ok: true,
      value: clone({
        role: demo.viewer === "helper" ? ("dependent" as const) : ("manager" as const),
        groupId: "demo-group",
        slots: demo.slots,
        members: demo.members,
        plans: demo.plans,
        me: demoMe(),
        myUserId: demoMyId(),
      }),
    };
  }
  const base = await loadFamily(today);
  if (!base.ok) return base;
  if (base.value === "none") {
    // A Max user planning before anyone has joined: a family of one, made when they first save.
    const uid = (await currentUserId()) ?? "";
    return {
      ok: true,
      value: {
        role: null,
        groupId: null,
        slots: [...DEFAULT_PLAN_SLOTS],
        members: [
          { userId: uid, role: "manager", displayName: null, defaultSize: "medium", isHelper: false, helperLanguage: "en", sharesLog: true },
        ],
        plans: [],
        me: myPlanSettingsFromRow(null),
        myUserId: uid,
      },
    };
  }
  const b = base.value;
  let dishRows: Rows = [];
  if (b.planRows.length > 0 && !b.me.isHelper) {
    const dishesRes = await supabase!
      .from("family_plan_dishes")
      .select("id, plan_id, plan_date, slot, recipe, translations, locked, logged_at")
      .in("plan_id", b.planRows.map((p) => String(p.id)));
    if (dishesRes.error) return fail("unavailable");
    dishRows = dishesRes.data ?? [];
  }
  return {
    ok: true,
    value: {
      role: b.role,
      groupId: b.groupId,
      slots: b.slots,
      members: b.members,
      plans: b.planRows.map((p) =>
        planFromRows(
          p,
          dishRows.filter((d) => d.plan_id === p.id),
          b.portionRows.filter((r) => r.plan_id === p.id),
        ),
      ),
      me: b.me,
      myUserId: b.uid,
    },
  };
}

/**
 * Helper mode's data. Dishes come through helper_plan_dishes, which carries no nutrition at all, and
 * the week's shopping list is the one the planner's phone last published.
 */
export async function getHelperPlan(today: string): Promise<PlanResult<HelperSnapshot>> {
  if (!live()) {
    return {
      ok: true,
      value: clone({
        groupId: "demo-group",
        myUserId: demoMyId(),
        me: demoMe(),
        members: demo.members,
        slots: demo.slots,
        plans: demo.plans.map((p) => ({
          id: p.id,
          weekStart: p.weekStart,
          portions: p.portions,
          dishes: p.dishes.map(({ perServing: _hidden, ...dish }) => dish),
          shopping: demo.shopping[p.id] ?? null,
        })),
      }),
    };
  }
  const base = await loadFamily(today);
  if (!base.ok) return base;
  if (base.value === "none") return fail("not_member");
  const b = base.value;
  let dishRows: Rows = [];
  if (b.planRows.length > 0) {
    const { data, error } = await supabase!.rpc("helper_plan_dishes", { p_plan_ids: b.planRows.map((p) => String(p.id)) });
    if (error) return fail("unavailable");
    dishRows = (data ?? []) as Rows;
  }
  return {
    ok: true,
    value: {
      groupId: b.groupId,
      myUserId: b.uid,
      me: b.me,
      members: b.members,
      slots: b.slots,
      plans: b.planRows.map((p) => ({
        id: String(p.id),
        weekStart: String(p.week_start),
        portions: portionsFromRows(b.portionRows.filter((r) => r.plan_id === p.id)),
        dishes: helperDishesFromRows(dishRows.filter((d) => d.plan_id === p.id)),
        shopping: shoppingSnapshotFrom(p.shopping, p.shopping_at),
      })),
    },
  };
}

// --- plan-week: generating, swapping and redoing days ------------------------------------------------

// The pantry the planner should lean on: what's in stock, briefly, at most 60 lines.
const pantryPayload = (pantry: PantryItem[]) =>
  pantry
    .filter((p) => p.inStock)
    .slice(0, 60)
    .map((p) => ({ name: p.name, nameZh: p.nameZh, quantity: p.quantity, unit: p.unit }));

// plan-week answers a refusal with { error: <code> } on a non-2xx status, which supabase-js surfaces
// as a FunctionsHttpError whose `context` is the raw Response.
async function planErrorReason(error: unknown): Promise<PlanFailReason> {
  try {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      const code = ((await (ctx as Response).json()) as { error?: string })?.error;
      if (code === "rate_limited") return "rate_limited";
      if (
        code === "max_required" ||
        code === "not_manager" ||
        code === "not_member" ||
        code === "already_generated" ||
        code === "regen_limit" ||
        code === "locked"
      ) {
        return code;
      }
    }
  } catch {
    // Fall through to the generic reason.
  }
  return "unavailable";
}

async function invokePlanWeek(body: Record<string, unknown>): Promise<PlanResult<string>> {
  const { data, error } = await supabase!.functions.invoke("plan-week", { body });
  if (error) return fail(await planErrorReason(error));
  return typeof data?.planId === "string" ? { ok: true, value: data.planId } : fail("unknown");
}

/** Make sure a Max user planning alone has a family to save settings into (no AI is spent). Its id. */
export async function ensureFamily(): Promise<PlanResult<string>> {
  if (!live()) return { ok: true, value: "demo-group" };
  const { data, error } = await supabase!.functions.invoke("plan-week", { body: { mode: "setup" } });
  if (error) return fail(await planErrorReason(error));
  return typeof data?.groupId === "string" ? { ok: true, value: data.groupId } : fail("unknown");
}

/** Plan a week (this week from today, or next week). Once per family per week. */
export async function generateWeek(weekStart: string, today: string, pantry: PantryItem[]): Promise<PlanResult<string>> {
  if (!live()) {
    if (demo.plans.some((p) => p.weekStart === weekStart)) return fail("already_generated");
    const plan = demoWeekPlan(weekStart, daysToPlan(weekStart, today), demo.slots, demoExclusions());
    demo.plans.push(plan);
    return { ok: true, value: plan.id };
  }
  return invokePlanWeek({ mode: "generate", weekStart, pantry: pantryPayload(pantry) });
}

/** Replace a day's dishes, keeping locked ones and any already logged. */
export async function regenerateDay(planId: string, date: string, pantry: PantryItem[]): Promise<PlanResult<string>> {
  if (!live()) {
    const plan = demoPlan(planId);
    if (!plan) return fail("unknown");
    const day = plan.dishes.filter((d) => d.date === date);
    const kept = new Set(day.filter((d) => d.locked || d.loggedAt).map((d) => d.slot));
    const target = demo.slots.filter((s) => !kept.has(s));
    if (target.length === 0) return fail("locked");
    if (day.length > 0 && plan.regenUsed >= REGEN_LIMIT_PER_WEEK) return fail("regen_limit");
    for (const slot of target) {
      const next = demoNextDish(plan, date, slot);
      plan.dishes = [...plan.dishes.filter((d) => !(d.date === date && d.slot === slot)), next];
    }
    if (day.length > 0) plan.regenUsed += 1;
    return { ok: true, value: planId };
  }
  return invokePlanWeek({ mode: "regenerate_day", planId, date, pantry: pantryPayload(pantry) });
}

/** Replace one dish (not a locked or logged one). */
export async function swapDish(planId: string, dishId: string, pantry: PantryItem[]): Promise<PlanResult<string>> {
  if (!live()) {
    const plan = demoPlan(planId);
    const dish = plan?.dishes.find((d) => d.id === dishId);
    if (!plan || !dish) return fail("unknown");
    if (dish.locked || dish.loggedAt) return fail("locked");
    if (plan.regenUsed >= REGEN_LIMIT_PER_WEEK) return fail("regen_limit");
    const next = demoNextDish(plan, dish.date, dish.slot);
    plan.dishes = plan.dishes.map((d) => (d.id === dishId ? { ...next, id: dishId } : d));
    plan.regenUsed += 1;
    return { ok: true, value: planId };
  }
  return invokePlanWeek({ mode: "swap", planId, dishId, pantry: pantryPayload(pantry) });
}

// --- Small writes ----------------------------------------------------------------------------------

const ok: PlanResult<true> = { ok: true, value: true };
const written = (error: unknown): PlanResult<true> => (error ? fail("unavailable") : ok);

/** Lock a dish so a day's regeneration keeps it (the manager only, by the access rules). */
export async function setDishLocked(planId: string, dishId: string, locked: boolean): Promise<PlanResult<true>> {
  if (!live()) {
    const plan = demoPlan(planId);
    if (plan) plan.dishes = plan.dishes.map((d) => (d.id === dishId ? { ...d, locked } : d));
    return ok;
  }
  const { error } = await supabase!.from("family_plan_dishes").update({ locked }).eq("id", dishId);
  return written(error);
}

/** A member's portion for one slot; null goes back to their usual size. */
export async function setPortion(
  groupId: string,
  planId: string,
  date: string,
  slot: MealType,
  userId: string,
  choice: PortionChoice | null,
): Promise<PlanResult<true>> {
  if (!live()) {
    const plan = demoPlan(planId);
    if (plan) {
      const key = `${date}|${slot}`;
      const row = { ...plan.portions[key] };
      if (choice === null) delete row[userId];
      else row[userId] = choice;
      plan.portions = { ...plan.portions, [key]: row };
    }
    return ok;
  }
  const match = { plan_id: planId, plan_date: date, slot, user_id: userId };
  if (choice === null) {
    const { error } = await supabase!.from("family_plan_portions").delete().match(match);
    return written(error);
  }
  const { error } = await supabase!
    .from("family_plan_portions")
    .upsert({ ...match, group_id: groupId, choice, updated_at: new Date().toISOString() });
  return written(error);
}

/** The slots this family plans, remembered for next week (the manager only). */
export async function setPlanSlots(groupId: string, slots: MealType[]): Promise<PlanResult<true>> {
  if (!live()) {
    demo.slots = [...slots];
    return ok;
  }
  const { error } = await supabase!
    .from("family_plan_settings")
    .upsert({ group_id: groupId, slots, updated_at: new Date().toISOString() });
  return written(error);
}

/**
 * My usual portion, the foods I don't eat, my helper-mode language and whether my food diary is open
 * to the planner. Only I can read or write these; whether I'm the helper is the planner's to set.
 */
export async function saveMySettings(groupId: string, settings: MyPlanSettings): Promise<PlanResult<true>> {
  if (!live()) {
    const mine = { ...clone(settings), isHelper: demoMe().isHelper };
    if (demo.viewer === "helper") demo.helperMe = mine;
    else demo.me = mine;
    demo.members = demo.members.map((m) =>
      m.userId === demoMyId()
        ? { ...m, defaultSize: settings.defaultSize, helperLanguage: settings.helperLanguage, sharesLog: settings.sharesLog }
        : m,
    );
    return ok;
  }
  // Through the database function, which saves exactly these four things for the caller only (see
  // database/0012_max_household.sql); a table upsert would also try to update the key columns.
  const { data, error } = await supabase!.rpc("save_my_plan_settings", {
    p_group_id: groupId,
    p_default_size: settings.defaultSize,
    p_exclusions: settings.exclusions,
    p_helper_language: settings.helperLanguage,
    p_log_private: !settings.sharesLog,
  });
  return error || data !== true ? fail("unavailable") : ok;
}

/**
 * The planner marks a member as the family's helper (or not) and sets her helper-mode language.
 * Marking her makes her food diary private; un-marking never reopens it (only she can).
 */
export async function setMemberHelper(userId: string, isHelper: boolean, language: HelperLanguage): Promise<PlanResult<true>> {
  if (!live()) {
    demo.members = demo.members.map((m) =>
      m.userId === userId ? { ...m, isHelper, helperLanguage: language, sharesLog: isHelper ? false : m.sharesLog } : m,
    );
    if (userId === DEMO_HELPER_ID) demo.helperMe = { ...demo.helperMe, isHelper, helperLanguage: language };
    return ok;
  }
  const { data, error } = await supabase!.rpc("set_member_helper", {
    p_user_id: userId,
    p_is_helper: isHelper,
    p_language: language,
  });
  return error || data !== true ? fail("unavailable") : ok;
}

/** Put a plan's dishes into a helper's language with the AI, cached on each dish. */
export async function translatePlan(planId: string, language: TranslatedLanguage): Promise<PlanResult<string>> {
  // The demo dishes carry their Filipino and Indonesian words already.
  if (!live()) return { ok: true, value: planId };
  return invokePlanWeek({ mode: "translate", planId, language });
}

/**
 * Publish the week's shopping list for helper mode. It is worked out on the planner's phone because the
 * pantry it subtracts lives there.
 */
export async function publishShopping(planId: string, snapshot: ShoppingSnapshot): Promise<PlanResult<true>> {
  if (!live()) {
    demo.shopping[planId] = clone(snapshot);
    return ok;
  }
  const { updatedAt, ...shopping } = snapshot;
  const { error } = await supabase!
    .from("family_week_plans")
    .update({ shopping, shopping_at: updatedAt })
    .eq("id", planId);
  return written(error);
}

/** The manager sets someone's usual portion (never their exclusions). */
export async function setMemberSize(userId: string, size: PortionSize): Promise<PlanResult<true>> {
  if (!live()) {
    demo.members = demo.members.map((m) => (m.userId === userId ? { ...m, defaultSize: size } : m));
    return ok;
  }
  const { data, error } = await supabase!.rpc("set_member_default_size", { p_user_id: userId, p_size: size });
  return error || data !== true ? fail("unavailable") : ok;
}

/**
 * 食咗 for the rest of the family: file each other eater's entry for their own phone to import. The
 * caller logs their own portion locally. Returns how many entries were sent.
 */
export async function logFamilyMeal(
  planId: string,
  dishId: string,
  others: Array<{ userId: string; entry: FamilyLogEntry }>,
): Promise<PlanResult<number>> {
  if (!live()) {
    const plan = demoPlan(planId);
    const dish = plan?.dishes.find((d) => d.id === dishId);
    if (!plan || !dish) return fail("unknown");
    if (dish.loggedAt) return fail("already_logged");
    plan.dishes = plan.dishes.map((d) => (d.id === dishId ? { ...d, loggedAt: new Date().toISOString() } : d));
    return { ok: true, value: others.length };
  }
  const { data, error } = await supabase!.rpc("log_family_meal", {
    p_dish_id: dishId,
    p_entries: others.map((o) => ({ user_id: o.userId, entry: o.entry })),
  });
  if (error || !data) return fail("unavailable");
  const d = data as { ok?: boolean; sent?: number; reason?: string };
  if (d.ok === true) return { ok: true, value: typeof d.sent === "number" ? d.sent : 0 };
  if (d.reason === "already_logged") return fail("already_logged");
  if (d.reason === "not_manager") return fail("not_manager");
  return fail("unknown");
}

/** Whether the planner may see this member's food diary: false once they keep it private (a helper). */
export async function memberSharesDiary(userId: string): Promise<boolean> {
  if (!live()) return demo.members.find((m) => m.userId === userId)?.sharesLog ?? true;
  const { data, error } = await supabase!.rpc("family_plan_roster");
  // Can't tell: the log screen behaves as it always has, and the database decides what it can read.
  if (error) return true;
  return rosterFromRows((data ?? []) as Rows).find((m) => m.userId === userId)?.sharesLog ?? true;
}

// --- The 食咗 inbox ------------------------------------------------------------------------------

/**
 * Entries waiting for this phone's diary, plus the ids of any row too malformed to import (which the
 * caller marks as handled, so it isn't fetched forever). Null when the inbox couldn't be reached.
 */
export async function fetchPendingInbox(): Promise<{ entries: InboxEntry[]; rejectedIds: string[] } | null> {
  if (!live()) return { entries: [], rejectedIds: [] };
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase!
    .from("family_log_inbox")
    .select("id, log_date, entry")
    .eq("user_id", uid)
    .is("imported_at", null)
    .order("created_at")
    .limit(50);
  if (error) return null;
  const entries: InboxEntry[] = [];
  const rejectedIds: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; log_date: string; entry: unknown }>) {
    const entry = inboxEntryFrom({ id: row.id, date: row.log_date, entry: row.entry });
    if (entry) entries.push(entry);
    else rejectedIds.push(row.id);
  }
  return { entries, rejectedIds };
}

export async function markInboxImported(ids: string[]): Promise<boolean> {
  if (ids.length === 0 || !live()) return true;
  const { error } = await supabase!.from("family_log_inbox").update({ imported_at: new Date().toISOString() }).in("id", ids);
  return !error;
}
