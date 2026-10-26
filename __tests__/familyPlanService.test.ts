import {
  generateWeek,
  getFamilyPlan,
  logFamilyMeal,
  regenerateDay,
  resetDemoFamilyPlan,
  setDishLocked,
  setPortion,
  swapDish,
} from "@/services/familyPlanService";
import { REGEN_LIMIT_PER_WEEK } from "@/constants/portionSizes";

// Without Supabase (as in Jest and the web preview) the plan runs on an in-memory demo family. These
// tests pin that the demo keeps the same rules as the live service, so previews show real behaviour.

// Weeks run Sunday to Saturday. A Wednesday, its week, and the week after.
const TODAY = "2026-10-28";
const THIS_WEEK = "2026-10-25";
const NEXT_WEEK = "2026-11-01";

async function snapshot() {
  const res = await getFamilyPlan(TODAY);
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

async function planned() {
  const res = await generateWeek(NEXT_WEEK, TODAY, []);
  if (!res.ok) throw new Error(res.reason);
  const plan = (await snapshot()).plans.find((p) => p.id === res.value)!;
  return plan;
}

beforeEach(() => resetDemoFamilyPlan());

describe("the demo family", () => {
  it("starts with three members on three sizes and nothing planned", async () => {
    const s = await snapshot();
    expect(s.role).toBe("manager");
    expect(s.members.map((m) => m.defaultSize)).toEqual(["medium", "large", "small"]);
    expect(s.slots).toEqual(["breakfast", "lunch", "dinner"]);
    expect(s.plans).toEqual([]);
  });

  it("plans every enabled slot of next week, varies lunch and dinner, and avoids what the family listed", async () => {
    const plan = await planned();
    expect(plan.dishes).toHaveLength(21);
    const mains = plan.dishes.filter((d) => d.slot !== "breakfast").map((d) => d.title);
    expect(new Set(mains).size).toBe(mains.length);
    expect(plan.dishes.some((d) => d.ingredients.some((i) => i.name.toLowerCase().includes("beef")))).toBe(false);
  });

  it("plans this week from today only", async () => {
    const res = await generateWeek(THIS_WEEK, TODAY, []);
    expect(res.ok).toBe(true);
    const plan = (await snapshot()).plans.find((p) => p.weekStart === THIS_WEEK)!;
    expect(new Set(plan.dishes.map((d) => d.date))).toEqual(new Set(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]));
  });

  it("plans a week once", async () => {
    await planned();
    expect(await generateWeek(NEXT_WEEK, TODAY, [])).toEqual({ ok: false, reason: "already_generated" });
  });
});

describe("changing the plan", () => {
  it("swaps a dish for one not already on the plan, and counts it", async () => {
    const plan = await planned();
    const dinner = plan.dishes.find((d) => d.slot === "dinner")!;
    await swapDish(plan.id, dinner.id, []);
    const after = (await snapshot()).plans[0];
    const swapped = after.dishes.find((d) => d.id === dinner.id)!;
    expect(swapped.title).not.toBe(dinner.title);
    expect(after.dishes.filter((d) => d.title === swapped.title)).toHaveLength(1);
    expect(after.regenUsed).toBe(1);
  });

  it("won't swap a locked dish, and keeps locked dishes when a day is redone", async () => {
    const plan = await planned();
    const day = plan.dishes.filter((d) => d.date === NEXT_WEEK);
    await setDishLocked(plan.id, day[0].id, true);
    expect(await swapDish(plan.id, day[0].id, [])).toEqual({ ok: false, reason: "locked" });

    await regenerateDay(plan.id, NEXT_WEEK, []);
    const after = (await snapshot()).plans[0].dishes.filter((d) => d.date === NEXT_WEEK);
    expect(after.find((d) => d.slot === day[0].slot)?.title).toBe(day[0].title);
    expect(after.find((d) => d.slot === day[1].slot)?.title).not.toBe(day[1].title);
  });

  it("stops at the week's swap allowance", async () => {
    const plan = await planned();
    const dish = plan.dishes[0];
    for (let i = 0; i < REGEN_LIMIT_PER_WEEK; i++) expect((await swapDish(plan.id, dish.id, [])).ok).toBe(true);
    expect(await swapDish(plan.id, dish.id, [])).toEqual({ ok: false, reason: "regen_limit" });
  });

  it("keeps a portion choice per slot and clears it back to the usual size", async () => {
    const plan = await planned();
    const dish = plan.dishes[0];
    await setPortion("demo-group", plan.id, dish.date, dish.slot, "demo-chi-keung", "skip");
    expect((await snapshot()).plans[0].portions[`${dish.date}|${dish.slot}`]).toEqual({ "demo-chi-keung": "skip" });
    await setPortion("demo-group", plan.id, dish.date, dish.slot, "demo-chi-keung", null);
    expect((await snapshot()).plans[0].portions[`${dish.date}|${dish.slot}`]).toEqual({});
  });

  it("logs a dish once", async () => {
    const plan = await planned();
    const dish = plan.dishes[0];
    expect(await logFamilyMeal(plan.id, dish.id, [])).toEqual({ ok: true, value: 0 });
    expect((await snapshot()).plans[0].dishes[0].loggedAt).not.toBeNull();
    expect(await logFamilyMeal(plan.id, dish.id, [])).toEqual({ ok: false, reason: "already_logged" });
  });
});
