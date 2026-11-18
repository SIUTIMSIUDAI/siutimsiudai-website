import type { InboxEntry } from "@/types/familyPlan";

// 食咗 for the family arrives on each member's phone through the inbox. These pin that each entry
// lands in that person's own diary exactly once, on the day the meal was planned for.

const mockFetchPendingInbox = jest.fn();
const mockMarkInboxImported = jest.fn();
jest.mock("@/services/familyPlanService", () => ({
  fetchPendingInbox: (...a: unknown[]) => mockFetchPendingInbox(...a),
  markInboxImported: (...a: unknown[]) => mockMarkInboxImported(...a),
  getFamilyPlan: jest.fn(),
  setPortion: jest.fn(),
}));

import { importFamilyInbox } from "@/services/familyInboxService";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import { useNutritionStore } from "@/stores/nutritionStore";

const entry = (id: string, date: string): InboxEntry => ({
  id,
  date,
  entry: {
    name: "Soy sauce chicken with rice",
    nameZh: "豉油雞飯",
    mealType: "dinner",
    calories: 738,
    protein: 45,
    carbs: 88.8,
    fat: 20,
    fiber: 1.3,
    quantity: 1.25,
    unit: "serving",
  },
});

const entriesOn = (date: string) => useNutritionStore.getState().logsByDate[date]?.entries ?? [];

beforeEach(() => {
  mockFetchPendingInbox.mockReset();
  mockMarkInboxImported.mockReset().mockResolvedValue(true);
  useFamilyPlanStore.getState().reset();
  useNutritionStore.setState({ logsByDate: {} });
});

it("adds each waiting entry to the diary on its own day, then marks them all handled", async () => {
  mockFetchPendingInbox.mockResolvedValue({ entries: [entry("in-1", "2026-10-26"), entry("in-2", "2026-10-27")], rejectedIds: ["bad-1"] });
  expect(await importFamilyInbox()).toBe(2);
  expect(entriesOn("2026-10-26")).toEqual([
    expect.objectContaining({ name: "Soy sauce chicken with rice", nameZh: "豉油雞飯", mealType: "dinner", calories: 738, quantity: 1.25, unit: "serving", source: "manual" }),
  ]);
  expect(entriesOn("2026-10-27")).toHaveLength(1);
  expect(mockMarkInboxImported).toHaveBeenCalledWith(["in-1", "in-2", "bad-1"]);
});

it("never adds an entry twice, even if its handled mark didn't reach the server", async () => {
  mockFetchPendingInbox.mockResolvedValue({ entries: [entry("in-1", "2026-10-26")], rejectedIds: [] });
  mockMarkInboxImported.mockResolvedValue(false); // offline: the server still thinks it's waiting
  await importFamilyInbox();
  await importFamilyInbox();
  expect(entriesOn("2026-10-26")).toHaveLength(1);
});

it("does nothing when the inbox can't be reached", async () => {
  mockFetchPendingInbox.mockResolvedValue(null);
  expect(await importFamilyInbox()).toBe(0);
  expect(mockMarkInboxImported).not.toHaveBeenCalled();
});
