import type { HelperSnapshot, ShoppingSnapshot } from "@/types/familyPlan";

// Helper mode asks the AI to translate the week's dishes into the helper's language. That costs money
// and allowance, so it must happen once per plan and language, not on every visit, and the planner's
// phone must publish the shopping list only when it has actually changed.

const mockGetHelperPlan = jest.fn();
const mockTranslatePlan = jest.fn();
const mockPublishShopping = jest.fn();
jest.mock("@/services/familyPlanService", () => ({
  getHelperPlan: (...a: unknown[]) => mockGetHelperPlan(...a),
  translatePlan: (...a: unknown[]) => mockTranslatePlan(...a),
  publishShopping: (...a: unknown[]) => mockPublishShopping(...a),
  getFamilyPlan: jest.fn(),
  setPortion: jest.fn(),
}));

import { useFamilyPlanStore } from "@/stores/familyPlanStore";

const dish = (translated: boolean) => ({
  id: "d1",
  planId: "p1",
  date: "2026-10-26",
  slot: "dinner" as const,
  title: "Soy sauce chicken with rice",
  titleZh: "豉油雞飯",
  totalMinutes: 40,
  ingredients: [{ name: "Chicken", nameZh: "雞肉", quantity: 200, unit: "g" as const, category: "meat" as const }],
  steps: [{ stepNumber: 1, instruction: "Poach the chicken.", instructionZh: "浸雞。", durationSeconds: null }],
  locked: false,
  loggedAt: null,
  translations: translated ? { fil: { title: "Manok sa toyo", ingredients: ["Manok"], steps: ["Ilaga ang manok."] } } : {},
});

const helperSnapshot = (translated: boolean, language: "en" | "fil" = "fil"): HelperSnapshot => ({
  groupId: "g1",
  myUserId: "maria",
  me: { defaultSize: "medium", exclusions: [], isHelper: true, helperLanguage: language, sharesLog: false },
  members: [],
  slots: ["dinner"],
  plans: [{ id: "p1", weekStart: "2026-10-25", portions: {}, dishes: [dish(translated)], shopping: null }],
});

const list = (kg: number): ShoppingSnapshot => ({
  updatedAt: "2026-10-26T09:00:00.000Z",
  fromDate: "2026-10-26",
  groups: [{ category: "meat", lines: [{ name: "Chicken", nameZh: "雞肉", quantity: kg, unit: "g" }] }],
});

beforeEach(() => {
  useFamilyPlanStore.getState().reset();
  mockGetHelperPlan.mockReset();
  mockTranslatePlan.mockReset();
  mockPublishShopping.mockReset();
});

describe("refreshHelper", () => {
  it("translates what's missing once, then shows the translated plan", async () => {
    mockGetHelperPlan.mockResolvedValueOnce({ ok: true, value: helperSnapshot(false) }).mockResolvedValue({ ok: true, value: helperSnapshot(true) });
    mockTranslatePlan.mockResolvedValue({ ok: true, value: "p1" });
    await useFamilyPlanStore.getState().refreshHelper();
    expect(mockTranslatePlan).toHaveBeenCalledTimes(1);
    expect(mockTranslatePlan).toHaveBeenCalledWith("p1", "fil");
    expect(useFamilyPlanStore.getState().helper?.plans[0].dishes[0].translations.fil?.title).toBe("Manok sa toyo");
    expect(useFamilyPlanStore.getState()).toMatchObject({ translating: false, translateFailed: false });
  });

  it("doesn't ask again in the same session after a failed try, and says it failed", async () => {
    mockGetHelperPlan.mockResolvedValue({ ok: true, value: helperSnapshot(false) });
    mockTranslatePlan.mockResolvedValue({ ok: false, reason: "rate_limited" });
    await useFamilyPlanStore.getState().refreshHelper();
    await useFamilyPlanStore.getState().refreshHelper();
    expect(mockTranslatePlan).toHaveBeenCalledTimes(1);
    expect(useFamilyPlanStore.getState().translateFailed).toBe(true);
  });

  it("needs no translation for English", async () => {
    mockGetHelperPlan.mockResolvedValue({ ok: true, value: helperSnapshot(false, "en") });
    await useFamilyPlanStore.getState().refreshHelper();
    expect(mockTranslatePlan).not.toHaveBeenCalled();
  });

  it("reports a plan it couldn't load", async () => {
    mockGetHelperPlan.mockResolvedValue({ ok: false, reason: "unavailable" });
    await useFamilyPlanStore.getState().refreshHelper();
    expect(useFamilyPlanStore.getState()).toMatchObject({ helper: null, helperError: "unavailable" });
  });
});

describe("publishShoppingIfChanged", () => {
  it("publishes a list once, and again only when it changes", async () => {
    mockPublishShopping.mockResolvedValue({ ok: true, value: true });
    const { publishShoppingIfChanged } = useFamilyPlanStore.getState();
    await publishShoppingIfChanged("p1", list(780));
    await publishShoppingIfChanged("p1", { ...list(780), updatedAt: "2026-10-26T10:00:00.000Z" });
    expect(mockPublishShopping).toHaveBeenCalledTimes(1);
    await publishShoppingIfChanged("p1", list(900));
    expect(mockPublishShopping).toHaveBeenCalledTimes(2);
  });

  it("tries again next time when a publish didn't go through", async () => {
    mockPublishShopping.mockResolvedValueOnce({ ok: false, reason: "unavailable" }).mockResolvedValue({ ok: true, value: true });
    const { publishShoppingIfChanged } = useFamilyPlanStore.getState();
    await publishShoppingIfChanged("p1", list(780));
    await publishShoppingIfChanged("p1", list(780));
    expect(mockPublishShopping).toHaveBeenCalledTimes(2);
  });
});
