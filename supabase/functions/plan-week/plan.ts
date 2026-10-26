// Prompts, answer checking and week rules for plan-week, the weekly family meal plan (Max). Pure on
// purpose: no Deno globals and no imports, so the app's Jest suite can test it (index.ts calls
// Deno.serve at module scope and cannot be imported). The Edge runtime can't import the app's modules
// either, so the slot and category lists below mirror constants/portionSizes.ts; keep them in step.

export const PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof PLAN_SLOTS)[number];
export const DEFAULT_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

export const CATEGORIES = ["meat", "seafood", "produce", "eggs_dairy_soy", "dry_goods", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Dish swaps plus day regenerations per plan week. Mirrors REGEN_LIMIT_PER_WEEK in the app. */
export const REGEN_LIMIT = 20;

const MAX_PANTRY_LINES = 60;
const MAX_EXCLUSIONS = 40;
const MAX_TERM = 40;

// --- Dates -----------------------------------------------------------------------------------
// Plain YYYY-MM-DD keys in UTC arithmetic, so the server's own time zone never shifts a day.

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Sunday a week starts on. Weeks run Sunday to Saturday everywhere in the app. */
export function weekStartOf(date: string): string {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

/** Today in Hong Kong (a fixed UTC+8, no daylight saving), which is the family's calendar. */
export function hkToday(nowMs: number): string {
  return new Date(nowMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A plan can be made for this week or next week only, named by its Sunday. Anything else is null. */
export function targetWeek(raw: unknown, today: string): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const thisWeek = weekStartOf(today);
  return raw === thisWeek || raw === addDays(thisWeek, 7) ? raw : null;
}

/** The days a new plan cooks for: today onwards in the current week, all seven of next week. */
export function daysToPlan(weekStart: string, today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d >= today);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

// --- Family inputs ---------------------------------------------------------------------------

/** The slots a family switched on, in day order. An empty or invalid setting falls back to the default. */
export function planSlots(raw: unknown): Slot[] {
  const list = Array.isArray(raw) ? PLAN_SLOTS.filter((s) => raw.includes(s)) : [];
  return list.length > 0 ? list : [...DEFAULT_SLOTS];
}

/**
 * Everything any eater said they don't eat, as one list: each member's own words (allergies too),
 * trimmed, deduplicated regardless of case, and capped so a long list can't crowd out the prompt.
 */
export function exclusionList(perMember: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of perMember) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const term = raw.trim().slice(0, MAX_TERM);
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      out.push(term);
      if (out.length >= MAX_EXCLUSIONS) return out;
    }
  }
  return out;
}

interface PantrySeed {
  name?: unknown;
  nameZh?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

export function pantryLines(pantry: unknown): string {
  if (!Array.isArray(pantry)) return "";
  return pantry
    .slice(0, MAX_PANTRY_LINES)
    .map((p: PantrySeed) => {
      const en = typeof p?.name === "string" ? p.name.trim().slice(0, MAX_TERM) : "";
      const zh = typeof p?.nameZh === "string" ? p.nameZh.trim().slice(0, MAX_TERM) : "";
      const label = [en, zh].filter(Boolean).join(" / ");
      const qty =
        typeof p?.quantity === "number" && p.quantity > 0 && typeof p.unit === "string"
          ? ` (~${p.quantity} ${p.unit.slice(0, 12)})`
          : "";
      return label ? `- ${label}${qty}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// --- Prompts ---------------------------------------------------------------------------------

export const PLAN_SYSTEM_PROMPT = [
  "You are a practical Hong Kong home cook planning a week of family meals. Follow these rules strictly:",
  "",
  "1. NEVER USE (most important): never use anything listed under 'Never use', not as an ingredient,",
  "   a garnish, a sauce or a stock. These are allergies and foods family members don't eat. When a",
  "   dish would normally contain one, choose a different dish. When in doubt, leave it out.",
  "2. ONE PLATE PER SLOT: each meal slot is one complete plate for one person. Lunch and dinner are a",
  "   home-style main served with rice or noodles; include the rice or noodles in the ingredients and in",
  "   the nutrition. Breakfast and snacks are everyday Hong Kong home breakfasts and snacks.",
  "3. USE THE PANTRY: prefer what the pantry already has, but you may add common ingredients from a",
  "   Hong Kong supermarket or wet market.",
  "4. VARIETY: no dish twice in the week, and a different main protein from one day to the next.",
  "5. REALISTIC: weekday dishes take 15 to 45 minutes; weekends can take a little longer.",
  "6. NO NUTRITION TAILORING: do not optimise for anyone's calories or health targets.",
  "",
  "Write for a Hong Kong home kitchen. Every titleZh / nameZh / instructionZh must be Traditional",
  "Chinese as used in Hong Kong.",
].join("\n");

function familyLines(pantry: unknown, exclusions: string[]): string[] {
  return [
    "Never use:",
    exclusions.length > 0 ? exclusions.map((e) => `- ${e}`).join("\n") : "- (nothing)",
    "",
    "Pantry:",
    pantryLines(pantry) || "- (empty)",
  ];
}

/** Step one of a full week: just the dish names for every day and slot, so the week can vary. */
export function outlinePrompt(input: { days: string[]; slots: Slot[]; pantry: unknown; exclusions: string[] }): string {
  return [
    `Plan these meal slots: ${input.slots.join(", ")}, for each of these days:`,
    ...input.days.map((d) => `- ${weekday(d)} ${d}`),
    "",
    ...familyLines(input.pantry, input.exclusions),
    "",
    "Respond with ONLY a JSON object, no prose, in exactly this shape:",
    '{"days": [{"date": "YYYY-MM-DD", "meals": [{"slot": "breakfast", "title": "English title", "titleZh": "中文菜名"}]}]}',
  ].join("\n");
}

export const DISH_SHAPE = [
  "{",
  '  "slot": "breakfast" | "lunch" | "dinner" | "snack",',
  '  "title": "English title", "titleZh": "中文菜名", "totalMinutes": <number>,',
  '  "ingredients": [{"name": "English", "nameZh": "中文", "quantity": <number>, "unit": "g" | "ml" | "piece", "category": "meat" | "seafood" | "produce" | "eggs_dairy_soy" | "dry_goods" | "other"}],',
  '  "steps": [{"stepNumber": <1-based int>, "instruction": "English", "instructionZh": "中文", "durationSeconds": <number or null>}],',
  '  "perServing": {"calories": <kcal>, "protein": <g>, "carbs": <g>, "fat": <g>, "fiber": <g>}',
  "}",
];

const DISH_RULES = [
  "Ingredient amounts are for ONE standard adult serving, raw, before cooking.",
  "Units: g for anything sold by weight (meat, fish, vegetables, ginger, garlic, spring onion, herbs),",
  "ml for liquids, piece only for things bought by count (eggs, slices of bread, whole fruit).",
  "category: meat; seafood; produce (vegetables, fruit, herbs, ginger, garlic); eggs_dairy_soy (eggs,",
  "milk, cheese, yoghurt, tofu, soy milk); dry_goods (rice, noodles, flour, dried foods, sauces, oils,",
  "seasonings); other.",
  "perServing: estimate calories (kcal) and protein, carbs, fat and fiber (g) for that ONE serving from",
  "the raw amounts listed, counting only the edible part (no bone).",
];

/** One day's dishes in full, either from the week's outline or fresh (regenerating a day). */
export function dayPrompt(input: {
  date: string;
  slots: Slot[];
  outline: Array<{ slot: Slot; title: string; titleZh: string }> | null;
  pantry: unknown;
  exclusions: string[];
  avoid: string[];
}): string {
  const asked = input.outline
    ? ["Write the full recipe for each of these planned dishes:", ...input.outline.map((o) => `- ${o.slot}: ${o.title} / ${o.titleZh}`)]
    : [`Plan one dish for each of these slots: ${input.slots.join(", ")}.`];
  return [
    `${weekday(input.date)} ${input.date}.`,
    ...asked,
    ...(input.avoid.length > 0
      ? ["", "Already on this week's plan, so choose different dishes:", ...input.avoid.map((t) => `- ${t}`)]
      : []),
    "",
    ...familyLines(input.pantry, input.exclusions),
    "",
    ...DISH_RULES,
    "",
    'Respond with ONLY a JSON object, no prose, of the shape {"dishes": [<dish>, ...]}, one <dish> per',
    "slot, where every <dish> is exactly this shape:",
    ...DISH_SHAPE,
  ].join("\n");
}

// --- Answer checking -------------------------------------------------------------------------

export interface CheckedDish {
  slot: Slot;
  title: string;
  titleZh: string;
  totalMinutes: number;
  ingredients: Array<{ name: string; nameZh: string; quantity: number; unit: "g" | "ml" | "piece"; category: Category }>;
  steps: Array<{ stepNumber: number; instruction: string; instructionZh: string; durationSeconds: number | null }>;
  perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const UNITS = ["g", "ml", "piece"] as const;

/**
 * One dish from the model, or null when it can't be cooked or logged as written: no title, no usable
 * ingredient, no steps (the helper cooks from them), or nutrition missing or out of range (食咗 writes
 * it into people's diaries). A bad ingredient line is dropped; a bad dish leaves its slot empty to
 * regenerate, never a guessed number.
 */
export function checkDish(raw: unknown, slots: Slot[]): CheckedDish | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slot = PLAN_SLOTS.find((s) => s === r.slot);
  if (!slot || !slots.includes(slot)) return null;
  const title = text(r.title, 120);
  const titleZh = text(r.titleZh, 120);
  if (!title || !titleZh) return null;

  const ingredients: CheckedDish["ingredients"] = [];
  for (const i of Array.isArray(r.ingredients) ? r.ingredients.slice(0, 25) : []) {
    const name = text(i?.name, 80);
    const nameZh = text(i?.nameZh, 80);
    const quantity = num(i?.quantity);
    const unit = UNITS.find((u) => u === i?.unit);
    if (!name || !nameZh || quantity === null || quantity <= 0 || quantity > 2000 || !unit) continue;
    const category = CATEGORIES.find((c) => c === i?.category) ?? "other";
    ingredients.push({ name, nameZh, quantity: Math.round(quantity * 10) / 10, unit, category });
  }
  if (ingredients.length === 0) return null;

  const steps: CheckedDish["steps"] = [];
  for (const s of Array.isArray(r.steps) ? r.steps.slice(0, 15) : []) {
    const instruction = text(s?.instruction, 500);
    const instructionZh = text(s?.instructionZh, 500);
    if (!instruction || !instructionZh) continue;
    const secs = num(s?.durationSeconds);
    steps.push({
      stepNumber: steps.length + 1,
      instruction,
      instructionZh,
      durationSeconds: secs !== null && secs > 0 && secs <= 14400 ? Math.round(secs) : null,
    });
  }
  if (steps.length === 0) return null;

  const n = (r.perServing ?? {}) as Record<string, unknown>;
  const calories = num(n.calories);
  const macros = [num(n.protein), num(n.carbs), num(n.fat), num(n.fiber)];
  if (calories === null || calories < 30 || calories > 3000) return null;
  if (macros.some((m) => m === null || m < 0 || m > 400)) return null;
  const [protein, carbs, fat, fiber] = macros.map((m) => Math.round((m as number) * 10) / 10);

  const minutes = num(r.totalMinutes);
  return {
    slot,
    title,
    titleZh,
    totalMinutes: minutes !== null && minutes > 0 && minutes <= 600 ? Math.round(minutes) : 30,
    ingredients,
    steps,
    perServing: { calories: Math.round(calories), protein, carbs, fat, fiber },
  };
}

/**
 * The second line of defence behind rule 1: a dish whose title or any ingredient names something a
 * member listed is dropped, so a slip by the model empties a slot rather than serving an allergen.
 * Literal matching only ("pork" catches "pork belly"; "shellfish" won't catch "shrimp", which is why
 * the app still asks the cook to check), and it errs towards dropping.
 */
export function breaksExclusions(dish: Pick<CheckedDish, "title" | "titleZh" | "ingredients">, exclusions: string[]): boolean {
  const haystack = [dish.title, dish.titleZh, ...dish.ingredients.flatMap((i) => [i.name, i.nameZh])]
    .join("\n")
    .toLowerCase();
  return exclusions.some((e) => {
    const term = e.trim().toLowerCase();
    return term.length > 0 && haystack.includes(term);
  });
}

/** A day's dishes from a parsed answer {"dishes": [...]}: checked, one per slot, none that break an exclusion. */
export function pickDayDishes(parsed: unknown, slots: Slot[], exclusions: string[]): CheckedDish[] {
  const list = parsed && typeof parsed === "object" ? (parsed as { dishes?: unknown }).dishes : null;
  if (!Array.isArray(list)) return [];
  const bySlot = new Map<Slot, CheckedDish>();
  for (const raw of list) {
    const dish = checkDish(raw, slots);
    if (!dish || bySlot.has(dish.slot) || breaksExclusions(dish, exclusions)) continue;
    bySlot.set(dish.slot, dish);
  }
  return slots.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s) as CheckedDish);
}

/** The week's outline from a parsed answer: dish names by "date|slot", for the requested days and slots only. */
export function pickOutline(
  parsed: unknown,
  days: string[],
  slots: Slot[],
): Map<string, { slot: Slot; title: string; titleZh: string }> {
  const out = new Map<string, { slot: Slot; title: string; titleZh: string }>();
  const list = parsed && typeof parsed === "object" ? (parsed as { days?: unknown }).days : null;
  if (!Array.isArray(list)) return out;
  for (const day of list) {
    const date = typeof day?.date === "string" ? day.date : "";
    if (!days.includes(date) || !Array.isArray(day.meals)) continue;
    for (const m of day.meals) {
      const slot = PLAN_SLOTS.find((s) => s === m?.slot);
      const title = text(m?.title, 120);
      const titleZh = text(m?.titleZh, 120);
      const key = `${date}|${slot}`;
      if (slot && slots.includes(slot) && title && titleZh && !out.has(key)) out.set(key, { slot, title, titleZh });
    }
  }
  return out;
}
