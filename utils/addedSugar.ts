/**
 * The added sugar the AI estimated for one food (grams of sugar, syrup, honey or condensed milk put
 * in when it was made), as the 少甜 / 走甜 tweaks use it. Rounded like the other macros and never
 * more than the food's carbs, since sugar is part of them. A missing or unusable figure is no
 * estimate (undefined), never a zero: zero means there is no sugar to take out, so it hides the
 * sugar tweaks, while no estimate falls back to a typical sweetened drink.
 */
export function parseAddedSugar(raw: unknown, carbs: number): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(Math.round(n), Math.max(0, carbs));
}
