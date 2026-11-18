import { parseAddedSugar } from "@/utils/addedSugar";

describe("parseAddedSugar", () => {
  it("reads the model's grams, rounded like the other macros", () => {
    expect(parseAddedSugar(12.4, 40)).toBe(12);
    expect(parseAddedSugar("18", 40)).toBe(18);
  });

  it("never claims more added sugar than the item has carbs", () => {
    expect(parseAddedSugar(30, 20)).toBe(20);
  });

  it("keeps a real zero: the item has no added sugar to take out", () => {
    expect(parseAddedSugar(0, 20)).toBe(0);
  });

  it("treats a missing or unusable figure as no estimate, never as zero", () => {
    expect(parseAddedSugar(undefined, 20)).toBeUndefined();
    expect(parseAddedSugar(null, 20)).toBeUndefined();
    expect(parseAddedSugar("", 20)).toBeUndefined();
    expect(parseAddedSugar("lots", 20)).toBeUndefined();
    expect(parseAddedSugar(-5, 20)).toBeUndefined();
  });
});
