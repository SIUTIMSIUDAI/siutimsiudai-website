// Maps a raw speech-recognition transcript to a cook-mode navigation intent. Kept as pure logic so
// the keyword grammar is unit-testable without the native recogniser. Locale-agnostic on purpose:
// Hong Kong cooks code-switch mid-sentence and a zh-HK recogniser can still surface English, so
// both languages are always accepted. The recogniser's LANGUAGE is still set per app locale in the
// hook; this only interprets whatever words come back.
export type VoiceCommand = "next" | "back";

// English keywords are matched on word boundaries so "next" never fires inside a longer word.
const NEXT_WORDS_EN = ["next", "forward", "continue"];
const BACK_WORDS_EN = ["back", "previous", "prev"];
// Chinese has no spaces, so these are matched as substrings. Traditional forms (zh-Hant / Cantonese).
const NEXT_WORDS_ZH = ["下一步", "下一", "繼續"];
const BACK_WORDS_ZH = ["上一步", "返上一步", "上一"];

// The full navigation vocabulary, exported to prime the iOS speech recogniser (contextualStrings).
// Biasing the recogniser toward these exact words lets a quiet or clipped command still register
// instead of competing with the whole dictionary. Kept here so it can never drift from the grammar
// that matchVoiceCommand actually accepts.
export const VOICE_HINT_WORDS: string[] = [
  ...NEXT_WORDS_EN,
  ...BACK_WORDS_EN,
  ...NEXT_WORDS_ZH,
  ...BACK_WORDS_ZH,
];

// Earliest character index at which any keyword in the group appears, or -1 if none do. English
// keywords use a word-boundary regex; Chinese keywords use a plain substring search.
function earliestIndex(haystack: string, enWords: string[], zhWords: string[]): number {
  let best = -1;
  const take = (i: number) => {
    if (i !== -1 && (best === -1 || i < best)) best = i;
  };
  for (const word of enWords) {
    const match = new RegExp(`\\b${word}\\b`).exec(haystack);
    take(match ? match.index : -1);
  }
  for (const word of zhWords) {
    take(haystack.indexOf(word));
  }
  return best;
}

// Returns the navigation intent for a transcript, or null when nothing recognisable was said. When a
// transcript somehow names both directions, the one spoken first wins.
export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;

  const nextAt = earliestIndex(text, NEXT_WORDS_EN, NEXT_WORDS_ZH);
  const backAt = earliestIndex(text, BACK_WORDS_EN, BACK_WORDS_ZH);

  if (nextAt === -1 && backAt === -1) return null;
  if (backAt === -1) return "next";
  if (nextAt === -1) return "back";
  return nextAt <= backAt ? "next" : "back";
}
