import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { cartExportService } from "@/services";
import { usePantryStore } from "@/stores/pantryStore";
import { useCartRunStore } from "@/stores/cartRunStore";
import {
  buildItemSearchUrl,
  humanizeAmount,
  missingItemsFromRecipe,
  searchTermFor,
} from "@/utils/cartExport";
import { openStoreUrl } from "@/utils/storeLauncher";
import { RETAILERS } from "@/constants/retailers";
import { tapLight } from "@/utils/haptics";
import { GroceryRetailer, Recipe, StoreAvailability } from "@/types";

interface Props {
  visible: boolean;
  recipe: Recipe;
  onClose: () => void;
}

/**
 * The Max-only "buy what I'm short of" sheet, in two steps.
 *
 * Step 1 compares the three retailers on the recipe's still-missing ingredients (pantry-aware) and
 * lets the shopper pick one. Step 2 is the shopping run itself: the same missing list as a
 * checklist, in that store's language, one tap per ingredient.
 *
 * Step 2 exists because of a limit in the stores, not in us. Only HKTVmall's search engine ORs
 * several terms, so only it can be handed the whole list in one URL; Wellcome matches a joined
 * string as a single phrase and returns nothing. Picking one ingredient to search and dropping the
 * rest is the behaviour this replaces. So the store opens once, and the checklist carries the
 * remaining ingredients one deliberate tap at a time, ticking off what is already in the basket.
 *
 * Tapping a store therefore no longer closes the sheet. Leaving for a store and coming back to a
 * list that remembers where you were is the whole point.
 */
export function CartExportSheet({ visible, recipe, onClose }: Props) {
  const { tl } = useLocale();
  const pantry = usePantryStore((s) => s.items);
  const missing = useMemo(() => missingItemsFromRecipe(recipe, pantry), [recipe, pantry]);

  const runs = useCartRunStore((s) => s.runs);
  const startRun = useCartRunStore((s) => s.startRun);
  const toggleItem = useCartRunStore((s) => s.toggleItem);
  const checkedCount = useCartRunStore((s) => s.checkedCount);
  const isChecked = useCartRunStore((s) => s.isChecked);
  const reconcile = useCartRunStore((s) => s.reconcile);
  const clearRun = useCartRunStore((s) => s.clearRun);

  const run = runs[recipe.id];
  const [availability, setAvailability] = useState<StoreAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<GroceryRetailer | null>(null);
  // Set when a store genuinely would not open, so the sheet can say so instead of looking broken.
  const [failedStore, setFailedStore] = useState<GroceryRetailer | null>(null);
  // Which step we are on. Held separately from `run` so the back arrow can return to the store list
  // WITHOUT throwing away the ticks: changing your mind about the store is not giving up the run.
  const [onRun, setOnRun] = useState(false);

  const names = useMemo(() => missing.map((m) => m.name), [missing]);

  useEffect(() => {
    if (!visible || missing.length === 0) {
      setAvailability([]);
      return;
    }
    let active = true;
    setLoading(true);
    setFailedStore(null); // a fresh open should not inherit the last run's error
    cartExportService.checkAvailability(missing).then((res) => {
      if (active) {
        setAvailability(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [visible, missing]);

  useEffect(() => {
    if (!visible) return;
    // Yesterday's ticks must not survive a pantry change. If the fridge gained soy sauce overnight
    // it is no longer on this list, so its tick would inflate "3 of 4" on a list of three.
    reconcile(recipe.id, names);
    // Reopen straight onto the run if one is already going, so leaving for the store and coming
    // back lands you back on your list rather than on the store picker you already answered.
    setOnRun(!!useCartRunStore.getState().runs[recipe.id]);
  }, [visible, recipe.id, names, reconcile]);

  // The widest catalogue in this run drives the "Best match" flag. Guarded so an all-zero run (or
  // the loading gap) never lights every row up.
  const bestFound = availability.reduce((max, a) => Math.max(max, a.foundCount), 0);

  const openUrls = useCallback(async (urls: { deepLinkUrl: string; webUrl: string }) => {
    const outcome = await openStoreUrl(urls, Linking);
    tapLight();
    return outcome;
  }, []);

  const handlePickStore = async (retailer: GroceryRetailer) => {
    setExporting(retailer);
    try {
      const payload = cartExportService.buildExport(retailer, missing);
      // Copying is a convenience; opening the store is the thing the user asked for. Never let a
      // clipboard failure stop the store from opening.
      try {
        await Clipboard.setStringAsync(payload.clipboardText);
      } catch {
        // Nothing to show for this: the store still opens and they can search by hand.
      }
      const outcome = await openUrls(payload);
      if (outcome === "failed") {
        setFailedStore(retailer);
        return;
      }
      // Move to the checklist rather than closing. Even where the store searched the whole list at
      // once, the shopper still has to tick things off one at a time.
      startRun(recipe.id, retailer);
      setOnRun(true);
    } finally {
      setExporting(null);
    }
  };

  const handleSearchItem = async (item: (typeof missing)[number], retailer: GroceryRetailer) => {
    setExporting(retailer);
    try {
      const urls = buildItemSearchUrl(RETAILERS[retailer], item);
      const outcome = await openUrls(urls);
      if (outcome === "failed") setFailedStore(retailer);
    } finally {
      setExporting(null);
    }
  };

  const handleFinish = () => {
    clearRun(recipe.id);
    setOnRun(false);
    onClose();
  };

  const runRetailer = run ? RETAILERS[run.retailer] : null;
  const doneCount = run ? checkedCount(recipe.id, names) : 0;
  const allDone = missing.length > 0 && doneCount === missing.length;
  const showRun = onRun && !!run && !!runRetailer && missing.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={tl("Close", "閂咗佢")}
          onPress={onClose}
        />
        <View className="rounded-t-3xl bg-surface px-4 pb-8 pt-3" style={{ maxHeight: "80%" }}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-surface-sunken" />
          <View className="mb-1 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-1">
              {showRun && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tl("Change store", "換過間鋪")}
                  onPress={() => setOnRun(false)}
                  className="-ml-2 h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="chevron-back" size={24} color={colors.inkMuted} />
                </Pressable>
              )}
              <ScalableText className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
                {showRun
                  ? tl(runRetailer.name, runRetailer.nameZh)
                  : tl("Buy missing ingredients", "買齊欠缺食材")}
              </ScalableText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tl("Close", "閂咗佢")}
              onPress={onClose}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={24} color={colors.inkMuted} />
            </Pressable>
          </View>

          {missing.length > 0 && (
            <ScalableText className="mb-3 text-sm text-ink-muted">
              {showRun
                ? tl(
                    `${doneCount} of ${missing.length} in the basket. Tap one to search it.`,
                    `入咗 ${doneCount} / ${missing.length} 樣。撳一樣就幫你搵。`,
                  )
                : tl(
                    `${missing.length} still short. Pick a store to send the list.`,
                    `仲爭 ${missing.length} 樣。揀間鋪發送清單。`,
                  )}
            </ScalableText>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {missing.length === 0 ? (
              <View className="items-center gap-2 py-8">
                <Ionicons name="checkmark-circle" size={28} color={colors.jade} />
                <ScalableText className="text-center text-sm text-ink-muted">
                  {tl(
                    "Your pantry's already got everything for this dish.",
                    "你個雪櫃已經齊晒料，唔使補貨。",
                  )}
                </ScalableText>
              </View>
            ) : showRun ? (
              <View className="gap-3">
                <View>
                  {missing.map((item) => {
                    const term = searchTermFor(item, runRetailer.searchLanguage);
                    const ticked = isChecked(recipe.id, item.name);
                    // Availability is computed from this very `missing` array, so the ids line up.
                    // During the loading gap there is no match yet, and "stocked" is the safe read.
                    const stocked =
                      availability
                        .find((a) => a.retailer === run.retailer)
                        ?.matches.find((m) => m.itemId === item.id)?.available ?? true;
                    return (
                      <View
                        key={item.id}
                        className="flex-row items-center border-b border-[#E8E1D2] py-1"
                      >
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: ticked }}
                          // The role and state announce ticked/unticked, so the label is just the
                          // ingredient rather than a phrase that would contradict the state.
                          accessibilityLabel={term}
                          onPress={() => {
                            tapLight();
                            toggleItem(recipe.id, item.name);
                          }}
                          className="h-11 w-11 items-center justify-center active:opacity-70"
                        >
                          <Ionicons
                            name={ticked ? "checkbox" : "square-outline"}
                            size={24}
                            color={ticked ? colors.brand : colors.inkFaint}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={tl(
                            `Search ${term} on ${runRetailer.name}`,
                            `喺${runRetailer.nameZh}搵${term}`,
                          )}
                          disabled={exporting !== null}
                          onPress={() => handleSearchItem(item, run.retailer)}
                          className="flex-1 flex-row items-center gap-2 py-2 pl-1 active:opacity-70"
                        >
                          <View className="flex-1">
                            <ScalableText
                              className={`text-base font-semibold ${
                                ticked ? "text-ink-faint line-through" : "text-ink"
                              }`}
                            >
                              {term}
                            </ScalableText>
                            {!stocked && (
                              <ScalableText className="pt-0.5 text-xs text-ink-faint">
                                {tl("Might not stock this one", "呢間可能冇貨")}
                              </ScalableText>
                            )}
                          </View>
                          <ScalableText
                            className={`text-sm ${ticked ? "text-ink-faint" : "text-ink-muted"}`}
                          >
                            {humanizeAmount(item.quantity, item.unit)}
                          </ScalableText>
                          <Ionicons name="search" size={16} color={colors.inkFaint} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                {failedStore && (
                  <View className="flex-row items-start gap-2 rounded-2xl bg-surface-sunken p-3">
                    <Ionicons name="alert-circle" size={16} color={colors.inkMuted} />
                    <ScalableText className="flex-1 text-xs text-ink-muted">
                      {tl(
                        `Couldn't open ${RETAILERS[failedStore].name}. Your list is copied, so you can paste it into the store yourself.`,
                        `打唔開${RETAILERS[failedStore].nameZh}。清單已經複製好，你可以自己貼上去。`,
                      )}
                    </ScalableText>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tl("Finish shopping", "買完喇")}
                  onPress={handleFinish}
                  className={`mt-1 items-center rounded-2xl py-3 active:opacity-80 ${
                    allDone ? "bg-jade" : "bg-surface-sunken"
                  }`}
                >
                  <ScalableText
                    className={`text-base font-bold ${allDone ? "text-white" : "text-ink-muted"}`}
                  >
                    {allDone ? tl("All done", "買齊喇") : tl("Finish shopping", "買完喇")}
                  </ScalableText>
                </Pressable>

                <View className="flex-row items-start gap-2 px-1">
                  <Ionicons name="bookmark-outline" size={14} color={colors.inkFaint} />
                  <ScalableText className="flex-1 text-xs text-ink-faint">
                    {tl(
                      "Close any time. We'll keep your ticks until you finish.",
                      "幾時閂都得，剔咗嘅嘢會幫你留住，等你買完為止。",
                    )}
                  </ScalableText>
                </View>
              </View>
            ) : loading ? (
              <View className="items-center py-8">
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <View className="gap-3">
                {availability.map((store) => {
                  const cfg = RETAILERS[store.retailer];
                  const allFound = store.foundCount === store.totalCount;
                  const isBest = bestFound > 0 && store.foundCount === bestFound;
                  const busy = exporting === store.retailer;
                  return (
                    <Pressable
                      key={store.retailer}
                      accessibilityRole="button"
                      accessibilityLabel={tl(
                        `Export to ${cfg.name}, ${store.foundCount} of ${store.totalCount} items found`,
                        `發送去${cfg.nameZh}，搵到 ${store.foundCount} / ${store.totalCount} 樣`,
                      )}
                      disabled={exporting !== null}
                      onPress={() => handlePickStore(store.retailer)}
                      className="flex-row items-center gap-3 rounded-2xl border border-[#E4DCCB] p-3 active:opacity-80"
                    >
                      <View
                        className="h-11 w-11 items-center justify-center rounded-full"
                        style={{ backgroundColor: cfg.brandColor }}
                      >
                        <Ionicons name="storefront" size={20} color={colors.white} />
                      </View>
                      <View className="flex-1 gap-0.5">
                        <View className="flex-row items-center gap-2">
                          <ScalableText className="text-base font-bold text-ink">
                            {tl(cfg.name, cfg.nameZh)}
                          </ScalableText>
                          {isBest && (
                            <View className="rounded-full bg-jade-100 px-2 py-0.5">
                              <ScalableText className="text-xs font-bold text-jade">
                                {tl("Best match", "貨最齊")}
                              </ScalableText>
                            </View>
                          )}
                        </View>
                        <ScalableText
                          className={`text-sm font-medium ${allFound ? "text-jade" : "text-ink-muted"}`}
                        >
                          {tl(
                            `${store.foundCount} / ${store.totalCount} items found`,
                            `搵到 ${store.foundCount} / ${store.totalCount} 樣`,
                          )}
                        </ScalableText>
                      </View>
                      {busy ? (
                        <ActivityIndicator color={colors.inkMuted} />
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
                      )}
                    </Pressable>
                  );
                })}

                {failedStore && (
                  <View className="flex-row items-start gap-2 rounded-2xl bg-surface-sunken p-3">
                    <Ionicons name="alert-circle" size={16} color={colors.inkMuted} />
                    <ScalableText className="flex-1 text-xs text-ink-muted">
                      {tl(
                        `Couldn't open ${RETAILERS[failedStore].name}. Your list is copied, so you can paste it into the store yourself.`,
                        `打唔開${RETAILERS[failedStore].nameZh}。清單已經複製好，你可以自己貼上去。`,
                      )}
                    </ScalableText>
                  </View>
                )}

                <View className="mt-1 flex-row items-start gap-2 px-1">
                  <Ionicons name="clipboard-outline" size={14} color={colors.inkFaint} />
                  <ScalableText className="flex-1 text-xs text-ink-faint">
                    {tl(
                      "We'll copy the full list and open the store, then tick items off here as you shop.",
                      "我哋會複製成張清單再打開間鋪，之後喺呢度逐樣剔走。",
                    )}
                  </ScalableText>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
