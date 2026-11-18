import { readFileSync } from "fs";
import path from "path";

// estimate-meal's prompt lives in index.ts, which calls Deno.serve and cannot be imported, so these
// read it as text. They pin the USDA anchors added 2026-11-18, when gemini-3.5-flash-lite put boiled
// spinach at 2.1 mg iron and luncheon meat at 360 to 580 mg sodium.
const source = readFileSync(path.join(__dirname, "../supabase/functions/estimate-meal/index.ts"), "utf8");

describe("estimate-meal prompt anchors (USDA FoodData Central, SR Legacy)", () => {
  it("gives boiled spinach its iron (168463: 3.57 mg per 100 g)", () => {
    expect(source).toContain("boiled spinach 10 mg vitamin C, 466 mg potassium and 3.6 mg iron");
  });

  it("gives luncheon meat and instant noodles their sodium (172951: 1,411 mg; 171177: 1,855 mg per 100 g)", () => {
    expect(source).toContain("canned luncheon meat has about 1,400 mg per 100 g");
    expect(source).toContain("a 100 g pack of instant noodles cooked with all its seasoning about 1,850 mg");
  });

  it("gives Chinese sausage its sodium (Centre for Food Safety, 臘腸: 1,420 mg per 100 g)", () => {
    expect(source).toContain("sausage (臘腸) has about 1,400 mg per 100 g (Hong Kong Centre for Food Safety)");
  });

  it("adds up a mixed dish's salty parts instead of judging the plate as a whole", () => {
    expect(source).toContain("A mixed dish's sodium is the sum of its salty parts at the amounts in it");
    expect(source).toContain("Add each one up, even when the dish is one entry.");
  });
});
