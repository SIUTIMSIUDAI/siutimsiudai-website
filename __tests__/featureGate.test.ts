import { featureMeetsTier } from "@/hooks/useFeatureAccess";

// The tier half of feature access, split out of the hook so the paywall policy is provable
// without rendering. `hasAccess` layers the free ai_log weekly quota on top of this; everything
// else is pure tier math. These tests pin the four Pro perks that have real UI surfaces
// (url_scraper, recipe_modifier, wet_market_units, pantry_suggest) plus the existing macro/micro
// drawers, so a stray edit to FEATURE_MIN_TIER can't silently drop a paywall.

describe("featureMeetsTier — free tier", () => {
  it("clears the everyday free features", () => {
    expect(featureMeetsTier("free", "total_calories")).toBe(true);
    expect(featureMeetsTier("free", "ai_log")).toBe(true);
    expect(featureMeetsTier("free", "local_metrics")).toBe(true);
    expect(featureMeetsTier("free", "local_checklist")).toBe(true);
  });

  it("is blocked from every Pro perk", () => {
    expect(featureMeetsTier("free", "url_scraper")).toBe(false);
    expect(featureMeetsTier("free", "recipe_modifier")).toBe(false);
    expect(featureMeetsTier("free", "wet_market_units")).toBe(false);
    expect(featureMeetsTier("free", "macro_drawer")).toBe(false);
    expect(featureMeetsTier("free", "micro_tracker")).toBe(false);
    expect(featureMeetsTier("free", "unlimited_ai")).toBe(false);
    expect(featureMeetsTier("free", "pantry_suggest")).toBe(false);
    expect(featureMeetsTier("free", "photo_recipe")).toBe(false);
    expect(featureMeetsTier("free", "backfill_log")).toBe(false);
    expect(featureMeetsTier("free", "receipt_scan")).toBe(false);
  });

  it("is blocked from every Max perk", () => {
    expect(featureMeetsTier("free", "family_sync")).toBe(false);
    expect(featureMeetsTier("free", "household_calendar")).toBe(false);
    expect(featureMeetsTier("free", "family_meal_plan")).toBe(false);
    expect(featureMeetsTier("free", "grocery_export")).toBe(false);
  });
});

describe("featureMeetsTier — pro tier", () => {
  it("unlocks the Pro perks, including the gated UI surfaces", () => {
    expect(featureMeetsTier("pro", "url_scraper")).toBe(true);
    expect(featureMeetsTier("pro", "recipe_modifier")).toBe(true);
    expect(featureMeetsTier("pro", "wet_market_units")).toBe(true);
    expect(featureMeetsTier("pro", "pantry_suggest")).toBe(true);
    expect(featureMeetsTier("pro", "photo_recipe")).toBe(true);
    expect(featureMeetsTier("pro", "macro_drawer")).toBe(true);
    expect(featureMeetsTier("pro", "micro_tracker")).toBe(true);
    expect(featureMeetsTier("pro", "backfill_log")).toBe(true);
    expect(featureMeetsTier("pro", "receipt_scan")).toBe(true);
  });

  it("still cannot reach the Max suite", () => {
    expect(featureMeetsTier("pro", "family_sync")).toBe(false);
    expect(featureMeetsTier("pro", "household_calendar")).toBe(false);
    expect(featureMeetsTier("pro", "family_meal_plan")).toBe(false);
    expect(featureMeetsTier("pro", "grocery_export")).toBe(false);
  });
});

describe("featureMeetsTier — max tier", () => {
  it("unlocks everything, Pro perks and Max suite alike", () => {
    expect(featureMeetsTier("max", "url_scraper")).toBe(true);
    expect(featureMeetsTier("max", "recipe_modifier")).toBe(true);
    expect(featureMeetsTier("max", "wet_market_units")).toBe(true);
    expect(featureMeetsTier("max", "pantry_suggest")).toBe(true);
    expect(featureMeetsTier("max", "photo_recipe")).toBe(true);
    expect(featureMeetsTier("max", "backfill_log")).toBe(true);
    expect(featureMeetsTier("max", "receipt_scan")).toBe(true);
    expect(featureMeetsTier("max", "family_sync")).toBe(true);
    expect(featureMeetsTier("max", "household_calendar")).toBe(true);
    expect(featureMeetsTier("max", "family_meal_plan")).toBe(true);
    expect(featureMeetsTier("max", "grocery_export")).toBe(true);
  });
});

// Recipe nutrition per serving (owner, 2026-10-19): calories are free, the breakdown is Pro and Max,
// the same split as the food diary. The card's calorie part rides on total_calories.
describe("featureMeetsTier — recipe nutrition breakdown", () => {
  it("keeps the breakdown off Free while its calories stay free", () => {
    expect(featureMeetsTier("free", "recipe_nutrition")).toBe(false);
    expect(featureMeetsTier("free", "total_calories")).toBe(true);
  });

  it("opens the breakdown on Pro and Max", () => {
    expect(featureMeetsTier("pro", "recipe_nutrition")).toBe(true);
    expect(featureMeetsTier("max", "recipe_nutrition")).toBe(true);
  });
});
