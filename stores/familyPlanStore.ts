import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "./persistStorage";
import {
  getFamilyPlan,
  getHelperPlan,
  publishShopping,
  setPortion as savePortion,
  translatePlan,
} from "@/services/familyPlanService";
import type { MealType } from "@/types";
import type {
  FamilyPlanSnapshot,
  HelperSnapshot,
  PlanFailReason,
  PlanResult,
  PortionChoice,
  ShoppingSnapshot,
} from "@/types/familyPlan";
import { todayKey } from "@/utils/formatters";
import { missingTranslations, shoppingFingerprint } from "@/utils/helperPlan";

// The weekly family plan on this phone. The plan itself is server data (re-read on every visit and
// after every change), so it lives in memory only, like the family roster. What IS persisted is this
// phone's own memory of what it has already written into its diary: inbox entries it imported and
// dishes whose 食咗 added its own portion, so neither can ever land twice.

const MAX_REMEMBERED = 300;
const remember = (list: string[], ids: string[]) =>
  [...list.filter((id) => !ids.includes(id)), ...ids].slice(-MAX_REMEMBERED);

// This session's translation attempts ("planId|language") and published lists (planId -> fingerprint).
// Memory only: a failed translation is tried again next launch, never in a loop, and an unchanged list
// is never sent twice.
const translateTried = new Set<string>();
const published = new Map<string, string>();

interface FamilyPlanState {
  snapshot: FamilyPlanSnapshot | null;
  loading: boolean;
  loadError: PlanFailReason | null;
  /** What is running ("generate", "swap:<dishId>", "day:<date>", "log:<dishId>"), for its spinner. */
  busy: string | null;
  importedInboxIds: string[];
  loggedDishIds: string[];

  refresh: () => Promise<void>;
  /** Run one change, then re-read the plan if it worked. */
  run: <T>(busy: string, op: () => Promise<PlanResult<T>>) => Promise<PlanResult<T>>;
  /** Show a portion change at once and save it behind; on failure, re-read so the screen is honest. */
  setPortion: (planId: string, date: string, slot: MealType, userId: string, choice: PortionChoice | null) => Promise<PlanResult<true>>;
  rememberImported: (ids: string[]) => void;
  rememberLogged: (dishId: string) => void;

  // Helper mode
  helper: HelperSnapshot | null;
  helperLoading: boolean;
  helperError: PlanFailReason | null;
  translating: boolean;
  translateFailed: boolean;
  /** Load helper mode, then translate any dish not yet in her language (once per plan and language). */
  refreshHelper: () => Promise<void>;
  /** The planner's phone: publish the week's list for helper mode when it has changed. */
  publishShoppingIfChanged: (planId: string, snapshot: ShoppingSnapshot) => Promise<void>;

  reset: () => void;
}

export const useFamilyPlanStore = create<FamilyPlanState>()(
  persist(
    (set, get) => ({
      snapshot: null,
      loading: false,
      loadError: null,
      busy: null,
      importedInboxIds: [],
      loggedDishIds: [],

      refresh: async () => {
        set({ loading: true });
        const res = await getFamilyPlan(todayKey());
        // A failed re-read keeps the last plan on screen and says so, rather than blanking it.
        set(res.ok ? { snapshot: res.value, loading: false, loadError: null } : { loading: false, loadError: res.reason });
      },

      run: async (busy, op) => {
        set({ busy });
        try {
          const res = await op();
          if (res.ok) await get().refresh();
          return res;
        } finally {
          set({ busy: null });
        }
      },

      setPortion: async (planId, date, slot, userId, choice) => {
        const snapshot = get().snapshot;
        if (!snapshot?.groupId) return { ok: false, reason: "unavailable" };
        const key = `${date}|${slot}`;
        set({
          snapshot: {
            ...snapshot,
            plans: snapshot.plans.map((p) => {
              if (p.id !== planId) return p;
              const row = { ...p.portions[key] };
              if (choice === null) delete row[userId];
              else row[userId] = choice;
              return { ...p, portions: { ...p.portions, [key]: row } };
            }),
          },
        });
        const res = await savePortion(snapshot.groupId, planId, date, slot, userId, choice);
        if (!res.ok) await get().refresh();
        return res;
      },

      rememberImported: (ids) => set((s) => ({ importedInboxIds: remember(s.importedInboxIds, ids) })),
      rememberLogged: (dishId) => set((s) => ({ loggedDishIds: remember(s.loggedDishIds, [dishId]) })),

      helper: null,
      helperLoading: false,
      helperError: null,
      translating: false,
      translateFailed: false,

      refreshHelper: async () => {
        set({ helperLoading: true });
        const res = await getHelperPlan(todayKey());
        if (!res.ok) {
          set({ helperLoading: false, helperError: res.reason });
          return;
        }
        set({ helper: res.value, helperLoading: false, helperError: null });
        const lang = res.value.me.helperLanguage;
        if (lang === "en") return;
        const todo = res.value.plans.filter(
          (p) => missingTranslations(p.dishes, lang).length > 0 && !translateTried.has(`${p.id}|${lang}`),
        );
        if (todo.length === 0) return;
        todo.forEach((p) => translateTried.add(`${p.id}|${lang}`));
        set({ translating: true, translateFailed: false });
        const results = await Promise.all(todo.map((p) => translatePlan(p.id, lang)));
        const again = await getHelperPlan(todayKey());
        set({
          translating: false,
          translateFailed: results.some((r) => !r.ok),
          ...(again.ok ? { helper: again.value } : {}),
        });
      },

      publishShoppingIfChanged: async (planId, snapshot) => {
        const print = shoppingFingerprint(snapshot);
        if (published.get(planId) === print) return;
        published.set(planId, print);
        const res = await publishShopping(planId, snapshot);
        // Not sent, so try again next time rather than believe it was.
        if (!res.ok) published.delete(planId);
      },

      reset: () => {
        translateTried.clear();
        published.clear();
        set({
          snapshot: null,
          loading: false,
          loadError: null,
          busy: null,
          importedInboxIds: [],
          loggedDishIds: [],
          helper: null,
          helperLoading: false,
          helperError: null,
          translating: false,
          translateFailed: false,
        });
      },
    }),
    {
      name: "siutimsiudai-family-plan",
      storage: persistStorage,
      partialize: (s) => ({ importedInboxIds: s.importedInboxIds, loggedDishIds: s.loggedDishIds }),
    },
  ),
);
