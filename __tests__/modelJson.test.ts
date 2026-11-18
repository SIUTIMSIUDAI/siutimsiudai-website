import { extractJson } from "../supabase/functions/_shared/modelJson";

// Every AI function reads the model's reply through extractJson. Models are asked for one JSON
// object, but some answer with the bare list instead ([...] rather than {"days": [...]}); gemini
// 3.5 Flash-Lite did so for 2 of 4 weekly-plan outlines (2026-11-18). These pin what it accepts.

describe("extractJson", () => {
  it("reads a JSON object, also inside a code fence or after a stray sentence", () => {
    expect(extractJson('{"meals": [{"name": "Rice"}]}')).toEqual({ meals: [{ name: "Rice" }] });
    expect(extractJson('```json\n{"swaps": []}\n```')).toEqual({ swaps: [] });
    expect(extractJson('Here you go: {"items": [1]} Enjoy!')).toEqual({ items: [1] });
  });

  it("wraps a bare list in the caller's key", () => {
    const reply = '[{"date": "2026-11-23", "meals": []}, {"date": "2026-11-24", "meals": []}]';
    expect(extractJson(reply, "days")).toEqual({
      days: [
        { date: "2026-11-23", meals: [] },
        { date: "2026-11-24", meals: [] },
      ],
    });
    expect(extractJson('```json\n[{"slot": "dinner"}]\n```', "dishes")).toEqual({ dishes: [{ slot: "dinner" }] });
    expect(extractJson('[{"name": "Egg"}]\nHope this helps!', "items")).toEqual({ items: [{ name: "Egg" }] });
  });

  it("unwraps the caller's object when the model put it inside a list", () => {
    expect(extractJson('[{"days": [{"date": "2026-11-23"}]}]', "days")).toEqual({ days: [{ date: "2026-11-23" }] });
  });

  it("still reads an object first when the caller names a key", () => {
    expect(extractJson('{"days": [{"date": "2026-11-23"}]}', "days")).toEqual({ days: [{ date: "2026-11-23" }] });
  });

  it("fails as bad model JSON on a cut-off list, or a list nobody asked for", () => {
    expect(() => extractJson('[{"date": "2026-11-23"}, {"date": "2026-1', "days")).toThrow(/^bad_model_json unparseable/);
    expect(() => extractJson('[{"a": 1}, {"b": 2}]')).toThrow(/^bad_model_json/);
  });

  it("fails as bad model JSON when there is no JSON at all", () => {
    expect(() => extractJson("Sorry, I can't help with that.", "meals")).toThrow(/^bad_model_json no_json/);
  });
});
