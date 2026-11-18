// Reading a model's JSON reply. Pure on purpose: no Deno globals and no imports, so the app's Jest
// suite can test it (vertex.ts imports Sentry from esm.sh and cannot be loaded there). vertex.ts
// re-exports extractJson, so every function keeps importing it from there.

// Gemini is asked to answer with pure JSON (generationConfig.responseMimeType), but never trust it:
// strip a ```json fence and grab the first balanced {...} so a stray sentence can't break parsing.
//
// Both failure modes throw with a "bad_model_json" prefix so proxyError classifies them as an
// UPSTREAM problem (502), not an internal bug (500). This mattered: a truncated response used to
// surface as a bare JSON.parse SyntaxError -> "internal_error", which sent us hunting for a broken
// credential when the model had actually answered fine and just run out of output budget.
//
// listKey names the key the caller's shape keeps its list under ("days" for {"days": [...]}). Some
// models answer with the bare list instead: gemini-3.5-flash-lite did for 2 of 4 weekly-plan
// outlines (2026-11-18). With listKey set, a reply that opens with "[" is read as that list and
// wrapped back into the caller's shape, so { [listKey]: [...] } is what comes out either way.
export function extractJson(text: string, listKey?: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const objectAt = body.indexOf("{");
  const listAt = listKey ? body.indexOf("[") : -1;
  const isList = listAt !== -1 && (objectAt === -1 || listAt < objectAt);
  const start = isList ? listAt : objectAt;
  // A list with no closing "]" was cut off, so it falls through to the parse and fails as truncation.
  const listEnd = body.lastIndexOf("]");
  const end = isList ? (listEnd === -1 ? body.length - 1 : listEnd) : body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`bad_model_json no_json len=${body.length} head=${body.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    // Nearly always truncation: the model ran out of maxOutputTokens mid-object. Log the tail so
    // the shape of the cut is obvious at a glance.
    throw new Error(`bad_model_json unparseable len=${body.length} tail=${body.slice(-160)}`);
  }
  if (!isList || !listKey) return parsed;
  const list = parsed as unknown[];
  // [{"days": [...]}]: the caller's own object, put inside a list.
  const only = list.length === 1 ? (list[0] as Record<string, unknown> | null) : null;
  if (only && typeof only === "object" && Array.isArray(only[listKey])) return only;
  return { [listKey]: list };
}
