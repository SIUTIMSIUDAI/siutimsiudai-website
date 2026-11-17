// The Hong Kong nutrient reference: every value the app's daily targets may use, copied exactly from
// Part A of the 2026-11-14 reference (Chinese DRIs 2023 for targets, WHO limits for sodium, free sugar,
// saturated and trans fat), each row with the doc's status tag and source ID. Part B of the doc (what
// Hong Kong people actually eat) is context only and never appears here.
//
// Rules for anyone editing this file:
//   1. Values come from the reference doc only. A value it doesn't give is not added here.
//   2. A row reaches the screen only through canShow(): verified or partial, AND a source ID whose link
//      anyone can open. Unverified rows, rows the doc gives no source for, and rows whose only source
//      needs a sign-in (SIGN_IN_ONLY_SOURCES) are kept for the record and never shown.
//   3. When a value is verified in an official or peer-reviewed source (the DRIs 2023 handbook, or a
//      source quoting it), update its status and source here, and the targets follow. Nothing else needs
//      to change. Sources added after the doc (O12 so far) are noted on their rows.

export type ReferenceStatus = "verified" | "partial" | "unverified";
export type ReferenceSex = "male" | "female" | "all";
export type ReferenceLifeStage = "general" | "pregnancy_t1" | "pregnancy_t2" | "pregnancy_t3" | "lactation";
/** RNI / AI / UL / AMDR / EER as in the DRIs; "limit" is a WHO ceiling; "target" a WHO or HK minimum. */
export type ReferenceValueType = "EER" | "EER increment" | "AMDR" | "RNI" | "AI" | "UL" | "PI-NCD" | "limit" | "target";
/** What a row drives in the app. "none" rows are stored for the record only. */
export type ReferenceUse = "target" | "limit" | "energy" | "ul" | "none";

export interface ReferenceRow {
  nutrient: string;
  ageMin: number;
  /** Inclusive; null means no upper age. */
  ageMax: number | null;
  sex: ReferenceSex;
  lifeStage: ReferenceLifeStage;
  /** Chinese DRI activity level, energy rows only. */
  pal: "light" | null;
  value: number;
  /** Upper end of a range (AMDR, fibre AI), else null. */
  valueMax: number | null;
  unit: string;
  valueType: ReferenceValueType;
  status: ReferenceStatus;
  /** The doc's source ID (O3, C1, S2...), or null where the doc names none. */
  sourceId: string | null;
  use: ReferenceUse;
  sourceNote: string;
}

export const NUTRIENT_REFERENCE: readonly ReferenceRow[] = [
  { nutrient: "energy", ageMin: 18, ageMax: 29, sex: "male", lifeStage: "general", pal: "light", value: 2150, valueMax: null, unit: "kcal", valueType: "EER", status: "verified", sourceId: "O7", use: "energy", sourceNote: "" },
  { nutrient: "energy", ageMin: 18, ageMax: 29, sex: "female", lifeStage: "general", pal: "light", value: 1700, valueMax: null, unit: "kcal", valueType: "EER", status: "verified", sourceId: "O7", use: "energy", sourceNote: "" },
  { nutrient: "energy", ageMin: 30, ageMax: 49, sex: "male", lifeStage: "general", pal: "light", value: 2050, valueMax: null, unit: "kcal", valueType: "EER", status: "verified", sourceId: "O7", use: "energy", sourceNote: "" },
  { nutrient: "energy", ageMin: 30, ageMax: 49, sex: "female", lifeStage: "general", pal: "light", value: 1700, valueMax: null, unit: "kcal", valueType: "EER", status: "verified", sourceId: "O7", use: "energy", sourceNote: "" },
  { nutrient: "energy", ageMin: 50, ageMax: 64, sex: "male", lifeStage: "general", pal: "light", value: 1950, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,950) in the doc." },
  { nutrient: "energy", ageMin: 50, ageMax: 64, sex: "female", lifeStage: "general", pal: "light", value: 1600, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,600). Conflict C1: HK PHC lists 1,950 kcal for women 50-64 (O3), which may be the moderate-activity figure." },
  { nutrient: "energy", ageMin: 65, ageMax: 74, sex: "male", lifeStage: "general", pal: "light", value: 1900, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,900) in the doc." },
  { nutrient: "energy", ageMin: 65, ageMax: 74, sex: "female", lifeStage: "general", pal: "light", value: 1550, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,550) in the doc." },
  { nutrient: "energy", ageMin: 75, ageMax: null, sex: "male", lifeStage: "general", pal: "light", value: 1800, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,800) in the doc." },
  { nutrient: "energy", ageMin: 75, ageMax: null, sex: "female", lifeStage: "general", pal: "light", value: 1500, valueMax: null, unit: "kcal", valueType: "EER", status: "unverified", sourceId: null, use: "energy", sourceNote: "Approximate (~1,500) in the doc." },
  { nutrient: "energy", ageMin: 18, ageMax: null, sex: "female", lifeStage: "pregnancy_t1", pal: null, value: 0, valueMax: null, unit: "kcal", valueType: "EER increment", status: "verified", sourceId: "O3", use: "none", sourceNote: "Verified as HK guidance." },
  { nutrient: "energy", ageMin: 18, ageMax: null, sex: "female", lifeStage: "pregnancy_t2", pal: null, value: 300, valueMax: null, unit: "kcal", valueType: "EER increment", status: "verified", sourceId: "O3", use: "none", sourceNote: "Verified as HK guidance." },
  { nutrient: "energy", ageMin: 18, ageMax: null, sex: "female", lifeStage: "pregnancy_t3", pal: null, value: 450, valueMax: null, unit: "kcal", valueType: "EER increment", status: "verified", sourceId: "O3", use: "none", sourceNote: "Verified as HK guidance." },
  { nutrient: "energy", ageMin: 18, ageMax: null, sex: "female", lifeStage: "lactation", pal: null, value: 500, valueMax: null, unit: "kcal", valueType: "EER increment", status: "verified", sourceId: "O3", use: "none", sourceNote: "Verified as HK guidance." },
  { nutrient: "protein", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 10, valueMax: 15, unit: "% energy", valueType: "AMDR", status: "verified", sourceId: "C1", use: "target", sourceNote: "HK PHC also gives 10-15% (O3)." },
  { nutrient: "protein", ageMin: 18, ageMax: 64, sex: "male", lifeStage: "general", pal: null, value: 65, valueMax: null, unit: "g", valueType: "RNI", status: "partial", sourceId: null, use: "none", sourceNote: "The doc tags this partial but names no source." },
  { nutrient: "protein", ageMin: 18, ageMax: 64, sex: "female", lifeStage: "general", pal: null, value: 55, valueMax: null, unit: "g", valueType: "RNI", status: "partial", sourceId: null, use: "none", sourceNote: "The doc tags this partial but names no source." },
  { nutrient: "protein", ageMin: 65, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 72, valueMax: null, unit: "g", valueType: "RNI", status: "unverified", sourceId: "S2", use: "none", sourceNote: "Approximate (~72). S2 says the 65+ value was raised in 2023." },
  { nutrient: "protein", ageMin: 65, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 62, valueMax: null, unit: "g", valueType: "RNI", status: "unverified", sourceId: "S2", use: "none", sourceNote: "Approximate (~62). S2 says the 65+ value was raised in 2023." },
  { nutrient: "fat", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 20, valueMax: 30, unit: "% energy", valueType: "AMDR", status: "verified", sourceId: "C1", use: "target", sourceNote: "Conflict C2: HK PHC gives 15-30% (O3); the doc recommends the Chinese range." },
  { nutrient: "saturatedFat", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 10, valueMax: null, unit: "% energy", valueType: "limit", status: "verified", sourceId: "O3", use: "limit", sourceNote: "WHO upper limit (less than 10%). The Chinese value is unverified and not given." },
  { nutrient: "transFat", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 1, valueMax: null, unit: "% energy", valueType: "limit", status: "verified", sourceId: "O3", use: "limit", sourceNote: "WHO upper limit (less than 1%)." },
  { nutrient: "carbs", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 50, valueMax: 65, unit: "% energy", valueType: "AMDR", status: "verified", sourceId: "C1", use: "target", sourceNote: "Conflict C2: HK PHC gives 55-75% (O3); the doc recommends the Chinese range." },
  { nutrient: "freeSugar", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 10, valueMax: null, unit: "% energy", valueType: "limit", status: "verified", sourceId: "O5", use: "limit", sourceNote: "WHO upper limit (less than 10%, about 50 g at 2,000 kcal). The Chinese value is unverified and not given." },
  { nutrient: "fiber", ageMin: 18, ageMax: 64, sex: "all", lifeStage: "general", pal: null, value: 25, valueMax: 30, unit: "g", valueType: "AI", status: "verified", sourceId: "S1", use: "none", sourceNote: "Doc table marks it verified, but S1 is a secondary source, which the doc's own definitions would call partial." },
  { nutrient: "fiber", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 25, valueMax: null, unit: "g", valueType: "target", status: "verified", sourceId: "O3", use: "target", sourceNote: "At least 25 g (WHO / HK DH)." },
  { nutrient: "epaDha", ageMin: 18, ageMax: 64, sex: "all", lifeStage: "general", pal: null, value: 0.25, valueMax: 2.0, unit: "g", valueType: "AMDR", status: "verified", sourceId: "S1", use: "none", sourceNote: "Optional in the doc. S1 is a secondary source." },
  { nutrient: "sodium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 2000, valueMax: null, unit: "mg", valueType: "limit", status: "verified", sourceId: "O4", use: "limit", sourceNote: "WHO: less than 2,000 mg sodium (5 g salt)." },
  { nutrient: "sodium", ageMin: 18, ageMax: 49, sex: "all", lifeStage: "general", pal: null, value: 2000, valueMax: null, unit: "mg", valueType: "PI-NCD", status: "verified", sourceId: "C9", use: "none", sourceNote: "Chinese 2013 edition, verified for 2013; the 2023 values are unverified." },
  { nutrient: "sodium", ageMin: 50, ageMax: 64, sex: "all", lifeStage: "general", pal: null, value: 1900, valueMax: null, unit: "mg", valueType: "PI-NCD", status: "verified", sourceId: "C9", use: "none", sourceNote: "Chinese 2013 edition, verified for 2013; the 2023 values are unverified." },
  { nutrient: "sodium", ageMin: 65, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 1800, valueMax: null, unit: "mg", valueType: "PI-NCD", status: "verified", sourceId: "C9", use: "none", sourceNote: "Chinese 2013 edition, verified for 2013; the 2023 values are unverified." },
  { nutrient: "potassium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 3500, valueMax: null, unit: "mg", valueType: "target", status: "verified", sourceId: "O8", use: "target", sourceNote: "WHO: at least 3,500 mg." },
  { nutrient: "potassium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 2000, valueMax: null, unit: "mg", valueType: "AI", status: "unverified", sourceId: null, use: "none", sourceNote: "Chinese AI." },
  { nutrient: "potassium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 3600, valueMax: null, unit: "mg", valueType: "PI-NCD", status: "unverified", sourceId: null, use: "none", sourceNote: "Chinese PI-NCD." },
  { nutrient: "calcium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 800, valueMax: null, unit: "mg", valueType: "RNI", status: "verified", sourceId: "S1", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-7, p. 635 (2026-11-17): 800 mg at 18, 30, 50, 65 and 75+. Shown with S1, which is public (also S2, S3). 2023 dropped the 50+ value from 1,000 to 800. Conflict C3: HK PHC lists 1,000 mg for women 18-64 (O3)." },
  { nutrient: "calcium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 2000, valueMax: null, unit: "mg", valueType: "UL", status: "unverified", sourceId: null, use: "ul", sourceNote: "" },
  { nutrient: "iron", ageMin: 18, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 12, valueMax: null, unit: "mg", valueType: "RNI", status: "verified", sourceId: "S1", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-7, p. 635 (2026-11-17): 12 mg at every adult age. Shown with S1, which is public; S1's mineral table (表3) also shows 12 mg (checked 2026-11-15)." },
  { nutrient: "iron", ageMin: 18, ageMax: 49, sex: "female", lifeStage: "general", pal: null, value: 18, valueMax: null, unit: "mg", valueType: "RNI", status: "verified", sourceId: "O3", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-7, p. 635 (2026-11-17): 18 mg at 18 and 30. Shown with O3 (HK PHC lists 18 mg), which is public." },
  { nutrient: "iron", ageMin: 50, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 10, valueMax: null, unit: "mg", valueType: "RNI", status: "verified", sourceId: "O3", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-7, p. 635 (2026-11-17): 10 mg for women without periods; at 50-64 it is 18 mg for women who still have periods (footnotes c and d), shown as a note (IRON_WITH_PERIODS_50_64_MG). 10 mg at 65 and 75. Shown with O3 (HK PHC lists 10 mg), which is public." },
  { nutrient: "iron", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 42, valueMax: null, unit: "mg", valueType: "UL", status: "unverified", sourceId: null, use: "ul", sourceNote: "" },
  { nutrient: "zinc", ageMin: 18, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 12, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "zinc", ageMin: 18, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 8.5, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: "S2", use: "none", sourceNote: "S2 says 2023 raised women's value." },
  { nutrient: "iodine", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 120, valueMax: null, unit: "mcg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "The doc gives no status tag for this value. Conflict C3: HK PHC lists 150 mcg (O3); the doc recommends the Chinese value." },
  { nutrient: "magnesium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 330, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: "S1", use: "none", sourceNote: "Approximate (~330). S1 says 2023 lowered it slightly." },
  { nutrient: "phosphorus", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 720, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "Approximate (~720)." },
  { nutrient: "selenium", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 60, valueMax: null, unit: "mcg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "copper", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 0.8, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 18, ageMax: 49, sex: "male", lifeStage: "general", pal: null, value: 770, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 50, ageMax: 64, sex: "male", lifeStage: "general", pal: null, value: 750, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 65, ageMax: 74, sex: "male", lifeStage: "general", pal: null, value: 730, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 75, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 710, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 18, ageMax: 64, sex: "female", lifeStage: "general", pal: null, value: 660, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 65, ageMax: 74, sex: "female", lifeStage: "general", pal: null, value: 640, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 75, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 600, valueMax: null, unit: "mcg RAE", valueType: "RNI", status: "partial", sourceId: "S1", use: "none", sourceNote: "" },
  { nutrient: "vitaminA", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 3000, valueMax: null, unit: "mcg RAE", valueType: "UL", status: "unverified", sourceId: null, use: "ul", sourceNote: "" },
  { nutrient: "vitaminD", ageMin: 18, ageMax: 64, sex: "all", lifeStage: "general", pal: null, value: 10, valueMax: null, unit: "mcg", valueType: "RNI", status: "verified", sourceId: "O3", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-8, p. 636 (2026-11-17): 10 mcg at 18, 30 and 50. Shown with O3 (HK PHC uses 10 mcg), which is public." },
  { nutrient: "vitaminD", ageMin: 65, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 15, valueMax: null, unit: "mcg", valueType: "RNI", status: "verified", sourceId: "O6", use: "target", sourceNote: "Checked in the DRIs 2023 book (O6), 附表3-8, p. 636 (2026-11-17): 15 mcg at 65 and 75. Cited as the DRIs 2023 entry on the Sources screen (owner, 2026-11-17); S2, its earlier source, needs a sign-in." },
  { nutrient: "vitaminD", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 50, valueMax: null, unit: "mcg", valueType: "UL", status: "unverified", sourceId: null, use: "ul", sourceNote: "" },
  { nutrient: "folate", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 400, valueMax: null, unit: "mcg DFE", valueType: "RNI", status: "verified", sourceId: "O3", use: "none", sourceNote: "Verified as HK guidance." },
  { nutrient: "vitaminC", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 100, valueMax: null, unit: "mg", valueType: "RNI", status: "verified", sourceId: "O12", use: "target", sourceNote: "Confirmed 2026-11-15 in O12 (Zhang X et al., China CDC Weekly 2024;6(51)), which cites the DRIs 2023: adults' recommended intake 100 mg, PI-NCD 200 mg. The 2026-11-14 doc tagged it unverified; O12 is not in its source list yet." },
  { nutrient: "vitaminC", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 200, valueMax: null, unit: "mg", valueType: "PI-NCD", status: "verified", sourceId: "O12", use: "none", sourceNote: "Confirmed 2026-11-15 in O12 (Zhang X et al., China CDC Weekly 2024;6(51)), which cites the DRIs 2023: adults' recommended intake 100 mg, PI-NCD 200 mg. The 2026-11-14 doc tagged it unverified; O12 is not in its source list yet." },
  { nutrient: "vitaminB1", ageMin: 18, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 1.4, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminB1", ageMin: 18, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 1.2, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminB2", ageMin: 18, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 1.4, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminB2", ageMin: 18, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 1.2, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "niacin", ageMin: 18, ageMax: null, sex: "male", lifeStage: "general", pal: null, value: 15, valueMax: null, unit: "mg NE", valueType: "RNI", status: "unverified", sourceId: "S1", use: "none", sourceNote: "S1 says 2023 lowered it." },
  { nutrient: "niacin", ageMin: 18, ageMax: null, sex: "female", lifeStage: "general", pal: null, value: 12, valueMax: null, unit: "mg NE", valueType: "RNI", status: "unverified", sourceId: "S1", use: "none", sourceNote: "S1 says 2023 lowered it." },
  { nutrient: "vitaminB6", ageMin: 18, ageMax: 49, sex: "all", lifeStage: "general", pal: null, value: 1.4, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminB6", ageMin: 50, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 1.6, valueMax: null, unit: "mg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminB12", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 2.4, valueMax: null, unit: "mcg", valueType: "RNI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminE", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 14, valueMax: null, unit: "mg α-TE", valueType: "AI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
  { nutrient: "vitaminK", ageMin: 18, ageMax: null, sex: "all", lifeStage: "general", pal: null, value: 80, valueMax: null, unit: "mcg", valueType: "AI", status: "unverified", sourceId: null, use: "none", sourceNote: "" },
];

// Sources in the doc whose links open only after signing in (checked 2026-11-15): S2 and S3 are Zhihu
// articles. The Sources screen can't cite them for a reader or an App Store reviewer, so a value they
// alone back is not shown.
// Women aged 50 to 64 who still have periods: the DRIs 2023 iron RNI is 18 mg, not the 10 mg for women
// without periods (附表3-7, p. 635, footnotes c and d; checked 2026-11-17). The app doesn't ask about
// periods, so the target stays 10 mg and the nutrient card shows this figure as a note for women in
// that age band (owner, 2026-11-17).
export const IRON_WITH_PERIODS_50_64_MG = 18;

export const SIGN_IN_ONLY_SOURCES: ReadonlySet<string> = new Set(["S2", "S3"]);

/** True when a row may reach the screen: verified or partial, and traceable to a source anyone can open. */
export function canShow(row: ReferenceRow): boolean {
  return row.status !== "unverified" && row.sourceId !== null && !SIGN_IN_ONLY_SOURCES.has(row.sourceId);
}

/** The rows for one nutrient that apply to this person (age, sex, life stage). */
export function rowsFor(
  nutrient: string,
  person: { age: number; sex: "male" | "female"; lifeStage?: ReferenceLifeStage },
): ReferenceRow[] {
  const stage = person.lifeStage ?? "general";
  return NUTRIENT_REFERENCE.filter(
    (r) =>
      r.nutrient === nutrient &&
      r.lifeStage === stage &&
      (r.sex === "all" || r.sex === person.sex) &&
      person.age >= r.ageMin &&
      (r.ageMax === null || person.age <= r.ageMax),
  );
}
