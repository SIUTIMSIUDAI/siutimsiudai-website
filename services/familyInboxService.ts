import { fetchPendingInbox, markInboxImported } from "./familyPlanService";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import { useNutritionStore } from "@/stores/nutritionStore";

// 食咗 for the family reaches each member through the server inbox, because each phone owns its own
// diary (sync_daily_log replaces a whole day from the phone). This brings this phone's waiting
// entries into its diary, on the day each meal was planned for, and the ordinary diary sync takes it
// from there. Run at launch and on every return to the foreground.

let running = false;

/** Import waiting 食咗 entries into this phone's diary. Returns how many were added. */
export async function importFamilyInbox(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const pending = await fetchPendingInbox();
    if (!pending) return 0;
    // Remembered per phone, so an entry whose "imported" mark never reached the server (offline,
    // app closed) is skipped next time rather than added again.
    const done = new Set(useFamilyPlanStore.getState().importedInboxIds);
    const fresh = pending.entries.filter((e) => !done.has(e.id));
    const { addEntry } = useNutritionStore.getState();
    for (const e of fresh) addEntry({ ...e.entry, source: "manual" }, e.date);
    useFamilyPlanStore.getState().rememberImported(fresh.map((e) => e.id));
    await markInboxImported([...pending.entries.map((e) => e.id), ...pending.rejectedIds]);
    return fresh.length;
  } finally {
    running = false;
  }
}
