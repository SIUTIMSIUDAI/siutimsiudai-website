import { create } from "zustand";
import { ScannedIngredient } from "@/types";

// A tiny, in-memory hand-off between the camera screen and the review screen. NOT persisted: a
// half-reviewed scan is throwaway draft state, so it must never survive a reload or leak into the
// next scan. The camera writes the AI's guesses here, the review screen reads + edits them, and
// Confirm/cancel clears them. Keeping this out of pantryStore keeps the persisted pantry clean of
// unconfirmed AI output.

// Where the draft came from. A fridge photo is what you have, so it adds new rows; a receipt is
// what you bought, so it tops up what the pantry already holds.
export type ScanSource = "fridge" | "receipt";

interface PantryScanState {
  draft: ScannedIngredient[];
  source: ScanSource;
  setDraft: (items: ScannedIngredient[], source?: ScanSource) => void;
  clearDraft: () => void;
}

export const usePantryScanStore = create<PantryScanState>((set) => ({
  draft: [],
  source: "fridge",
  setDraft: (items, source = "fridge") => set({ draft: items, source }),
  clearDraft: () => set({ draft: [], source: "fridge" }),
}));
