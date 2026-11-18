import { parseAmount, formatAmountLabel } from "../manualAmount";

// parseAmount turns the free-text "Amount" box on the manual log into two things: a count
// multiplier for scaling a KNOWN dish's fixed per-serving macros, and a human label to store and
// show as the entry's unit. Measurement units (g / ml / cup ...) are NOT multipliers, so their
// leading number must never scale the macros.
describe("parseAmount", () => {
  it("treats a blank amount as one plain serving with no label", () => {
    expect(parseAmount("")).toEqual({ multiplier: 1, label: null });
    expect(parseAmount("   ")).toEqual({ multiplier: 1, label: null });
  });

  it("reads a bare number as a count multiplier, no label", () => {
    expect(parseAmount("2")).toEqual({ multiplier: 2, label: null });
    expect(parseAmount("2.5")).toEqual({ multiplier: 2.5, label: null });
  });

  it("caps a runaway count so a stray big number can't blow up the day", () => {
    expect(parseAmount("200")).toEqual({ multiplier: 99, label: null });
    expect(parseAmount("150 bowls")).toEqual({ multiplier: 99, label: "150 bowls" });
  });

  it("falls back to one serving for a zero or junk leading value", () => {
    expect(parseAmount("0")).toEqual({ multiplier: 1, label: null });
  });

  it("keeps a count unit as both a multiplier and a label", () => {
    expect(parseAmount("2 bowls")).toEqual({ multiplier: 2, label: "2 bowls" });
    expect(parseAmount("2 pieces")).toEqual({ multiplier: 2, label: "2 pieces" });
    expect(parseAmount("3 件")).toEqual({ multiplier: 3, label: "3 件" });
  });

  it("never turns a measurement into a multiplier (English units)", () => {
    expect(parseAmount("200 g")).toEqual({ multiplier: 1, label: "200 g" });
    expect(parseAmount("200g")).toEqual({ multiplier: 1, label: "200g" });
    expect(parseAmount("250 ml")).toEqual({ multiplier: 1, label: "250 ml" });
    expect(parseAmount("250 mL")).toEqual({ multiplier: 1, label: "250 mL" });
    expect(parseAmount("1.5 cup")).toEqual({ multiplier: 1, label: "1.5 cup" });
  });

  it("never turns a measurement into a multiplier (Chinese units, no space)", () => {
    expect(parseAmount("200克")).toEqual({ multiplier: 1, label: "200克" });
    expect(parseAmount("250毫升")).toEqual({ multiplier: 1, label: "250毫升" });
  });

  it("keeps a unit-only entry as a label at one serving", () => {
    expect(parseAmount("bowl")).toEqual({ multiplier: 1, label: "bowl" });
    expect(parseAmount("半碗")).toEqual({ multiplier: 1, label: "半碗" });
  });
});

// formatAmountLabel decides what (if anything) the diary row shows next to a logged item. The stored
// defaults ("serving" / "1 serving", quantity 1) are boring and must stay hidden so today's entries
// look unchanged; a real amount ("2 bowls", "200 g") shows verbatim; a bare count shows as "x2".
describe("formatAmountLabel", () => {
  it("shows nothing for the boring default portion", () => {
    expect(formatAmountLabel(1, "serving")).toBeNull();
    expect(formatAmountLabel(1, "1 serving")).toBeNull();
    expect(formatAmountLabel(1, "servings")).toBeNull();
    expect(formatAmountLabel(1, "")).toBeNull();
  });

  it("shows a real unit label verbatim", () => {
    expect(formatAmountLabel(2, "2 bowls")).toBe("2 bowls");
    expect(formatAmountLabel(1, "200 g")).toBe("200 g");
    expect(formatAmountLabel(1, "1 bowl")).toBe("1 bowl");
  });

  it("shows a bare count as a language-neutral multiplier", () => {
    expect(formatAmountLabel(2, "serving")).toBe("x2");
    expect(formatAmountLabel(3, "servings")).toBe("x3");
  });
});
