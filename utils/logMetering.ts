import { LogSource } from "@/types";

// Which log sources spend one of a free user's weekly AI credits. Only photo recognition is
// metered: it is the single path with a real per-call vision cost at Google and the natural Pro
// upsell. Typing (manual), voice, and barcode (a free Open Food Facts lookup) are always free; a
// per-user daily cap on the server still guards against abuse of the AI endpoints.
const METERED_LOG_SOURCES: ReadonlySet<LogSource> = new Set<LogSource>(["photo"]);

export function isMeteredLogSource(source: LogSource): boolean {
  return METERED_LOG_SOURCES.has(source);
}
