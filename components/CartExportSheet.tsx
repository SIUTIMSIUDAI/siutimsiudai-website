import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, View } from "react-native";
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
import { RETAILER_ORDER, RETAILERS } from "@/constants/retailers";
import { canonicalizeIngredient } from "@/constants/ingredientDictionary";
import { tapLight } from "@/utils/haptics";
import { GroceryListItem, GroceryRetailer, Recipe } from "@/types";

// Opened from a recipe (its missing ingredients against the pantry, as always), or with a ready-made
// list, such as the family plan's week, under its own run key.
type Props = { visible: boolean; onClose: () => void } & (
  | { recipe: Recipe; runKey?: undefined; items?: undefined }
  | { recipe?: undefined; runKey: string; items: GroceryListItem[] }
);

/**
 * The Max-only "buy what I'm short of" sheet, in two steps.
 *
 * Step 1 lists the three retailers with what each can do for a multi-item list, and lets the shopper
 * pick one. Step 2 is the shopping run itself: the recipe's still-missing ingredients (pantry-aware)
 * as a checklist, in that store's language, one tap per ingredient.
 *
 * Step 2 exists because of a limit in the stores, not in us. None of them can be handed the whole
 * list in one search: Wellcome matches a joined string as a single phrase, and the HKTVmall app our
 * link opens answers 系統異常 to one (2026-10-19). So the store opens once, and the checklist carries
 * the ingredients one deliberate tap at a time.
 *
 * Owner, 2026-10-19: search one item, pick it in the store, come back, and it's ticked for you. The
 * app can't see the store's cart, so the signal is the round trip itself: a search remembers its
 * ingredient (markSearching), and when the app comes back from the background it is ticked
 * (completePending) with a line saying so and how to untick. Coming back to a list that remembers
 * where you were is the whole point, so tapping a store never closes the sheet.
 */
export function CartExportSheet({ visible, recipe, runKey: listKey, items, onClose }: Props) {
  const { tl } = useLocale();
  const pantry = usePantryStore((s) => s.items);
  const missing = useMemo(
    () => (recipe ? missingItemsFromRecipe(recipe, pantry) : (items ?? [])),
    [recipe, pantry, items],
  );
  // The run is remembered under the recipe's id, or the list's own key.
  const runKey = recipe ? recipe.id : (listKey ?? "");

  const runs = useCartRunStore((s) => s.runs);
  const startRun = useCartRunStore((s) => s.startRun);
  const toggleItem = useCartRunStore((s) => s.toggleItem);
  const checkedCount = useCartRunStore((s) => s.checkedCount);
  const isChecked = useCartRunStore((s) => s.isChecked);
  const reconcile = useCartRunStore((s) => s.reconcile);
  const clearRun = useCartRunStore((s) => s.clearRun);
  const markSearching = useCartRunStore((s) => s.markSearching);
  const clearPending = useCartRunStore((s) => s.clearPending);
  const completePending = useCartRunStore((s) => s.completePending);

  const run = runs[runKey];
  // The ingredient just ticked on coming back from the store, named in a line with how to untick it.
  const [autoTicked, setAutoTicked] = useState<string | null>(null);
  const [exporting, setExporting] = useState<GroceryRetailer | null>(null);
  // Set when a store genuinely would not open, so the sheet can say so instead of looking broken.
  const [failedStore, setFailedStore] = useState<GroceryRetailer | null>(null);
  // Which step we are on. Held separately from `run` so the back arrow can return to the store list
  // WITHOUT throwing away the ticks: changing your mind about the store is not giving up the run.
  const [onRun, setOnRun] = useState(false);

  const names = useMemo(() => missing.map((m) => m.name), [missing]);

  // Back from the store: tick the ingredient they went for and say so, in the store's language.
  const tickOnReturn = useCallback(() => {
    const key = completePending(runKey);
    if (!key) return;
    const item = missing.find((m) => canonicalizeIngredient(m.name) === key);
    const retailerId = useCartRunStore.getState().runs[runKey]?.retailer;
    if (item && retailerId) setAutoTicked(searchTermFor(item, RETAILERS[retailerId].searchLanguage));
  }, [completePending, runKey, missing]);

  useEffect(() => {
    if (!visible) return;
    // Yesterday's ticks must not survive a pantry change. If the fridge gained soy sauce overnight
    // it is no longer on this list, so its tick would inflate "3 of 4" on a list of three.
    reconcile(runKey, names);
  }, [visible, runKey, names, reconcile]);

  // Once per open, never on a list change, so a pantry update can't wipe the notice they came back to.
  useEffect(() => {
    if (!visible) return;
    // A fresh open should not inherit the last run's "couldn't open" error or tick notice.
    setFailedStore(null);
    setAutoTicked(null);
    // A search still pending here means the OS closed us while they were at the store, so they
    // have come back by definition: tick it now.
    tickOnReturn();
    // Reopen straight onto the run if one is already going, so leaving for the store and coming
    // back lands you back on your list rather than on the store picker you already answered.
    setOnRun(!!useCartRunStore.getState().runs[runKey]);
    // tickOnReturn is deliberately left out: it changes with the list, and this must run per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, runKey]);

  // Only a real trip counts: the app went to the background while a search was pending and is now
  // active again. A notification shade or a system prompt (inactive, never background) ticks nothing.
  const leftForStore = useRef(false);
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        if (useCartRunStore.getState().runs[runKey]?.pendingKey) leftForStore.current = true;
      } else if (next === "active" && leftForStore.current) {
        leftForStore.current = false;
        tickOnReturn();
      }
    });
    return () => sub.remove();
  }, [visible, runKey, tickOnReturn]);

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
      startRun(runKey, retailer);
      setOnRun(true);
    } finally {
      setExporting(null);
    }
  };

  const handleSearchItem = async (item: (typeof missing)[number], retailer: GroceryRetailer) => {
    setExporting(retailer);
    setAutoTicked(null);
    // Remember what they went for BEFORE leaving, so the tick lands even if they come back before
    // the open call has returned.
    markSearching(runKey, item.name);
    try {
      const urls = buildItemSearchUrl(RETAILERS[retailer], item);
      const outcome = await openUrls(urls);
      if (outcome === "failed") {
        clearPending(runKey);
        setFailedStore(retailer);
      }
    } finally {
      setExporting(null);
    }
  };

  const handleFinish = () => {
    clearRun(runKey);
    setOnRun(false);
    onClose();
  };

  const runRetailer = run ? RETAILERS[run.retailer] : null;
  const doneCount = run ? checkedCount(runKey, names) : 0;
  const allDone = missing.length > 0 && doneCount === missing.length;
  const showRun = onRun && !!run && !!runRetailer && missing.length > 0;
  // The first still-missing ingredient not yet ticked into the basket. One button can then walk the
  // shopper straight to the next gap instead of leaving them to hunt the list for it. Computed in
  // render, which is exactly when a tick changes, so it always points at the real next item.
  const nextItem = showRun ? missing.find((m) => !isChecked(runKey, m.name)) : undefined;

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
                ? runRetailer?.supportsMultiTermSearch
                  ? tl(
                      `${doneCount} of ${missing.length} in the basket. The whole list's searched. Add each and tick it off.`,
                      `入咗 ${doneCount} / ${missing.length} 樣。成張單搵晒喇，加咗入車就剔走佢。`,
                    )
                  : tl(
                      `${doneCount} of ${missing.length} ticked. Search one at a time: add it to your cart in the store, come back, and we'll tick it.`,
                      `剔咗 ${doneCount} / ${missing.length} 樣。逐樣搵：喺間鋪加咗入車，返嚟就自動幫你剔。`,
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
                  {recipe
                    ? tl("Your pantry's already got everything for this dish.", "你個雪櫃已經齊晒料，唔使補貨。")
                    : tl("Your pantry's already got everything on this list.", "你個雪櫃已經齊晒呢張清單啲料。")}
                </ScalableText>
              </View>
            ) : showRun ? (
              <View className="gap-3">
                {/* We tick on the round trip, not on the store's cart, which we can't see. So say
                    what we ticked and how to take it back, right where they land. */}
                {autoTicked && (
                  <View
                    accessibilityLiveRegion="polite"
                    className="flex-row items-start gap-2 rounded-2xl bg-surface-sunken p-3"
                  >
                    <Ionicons name="checkmark-circle" size={16} color={colors.jade} />
                    <ScalableText className="flex-1 text-sm text-ink">
                      {tl(
                        `Ticked ${autoTicked}. Didn't get it? Tap its box to untick.`,
                        `已幫你剔咗${autoTicked}。未買到？撳返個格就取消。`,
                      )}
                    </ScalableText>
                  </View>
                )}

                <View>
                  {missing.map((item) => {
                    const term = searchTermFor(item, runRetailer.searchLanguage);
                    const ticked = isChecked(runKey, item.name);
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
                            toggleItem(runKey, item.name);
                            // They've acted on the ticks themselves, so the "we ticked X" line is spent.
                            setAutoTicked(null);
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

                {nextItem && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tl(
                      `Search ${searchTermFor(nextItem, runRetailer.searchLanguage)} on ${runRetailer.name}`,
                      `喺${runRetailer.nameZh}搵${searchTermFor(nextItem, runRetailer.searchLanguage)}`,
                    )}
                    disabled={exporting !== null}
                    onPress={() => handleSearchItem(nextItem, run.retailer)}
                    style={{ backgroundColor: colors.brand }}
                    className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 active:opacity-80"
                  >
                    <Ionicons name="search" size={18} color={colors.white} />
                    <ScalableText className="text-base font-bold text-white">
                      {tl(
                        `Search ${searchTermFor(nextItem, runRetailer.searchLanguage)}`,
                        `搵${searchTermFor(nextItem, runRetailer.searchLanguage)}`,
                      )}
                    </ScalableText>
                  </Pressable>
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
            ) : (
              <View className="gap-3">
                {/* What "still short" actually means, spelled out: the exact missing lines (name +
                    shoppable amount) the chosen store will be handed, so the shopper sees the list
                    before committing to a store rather than a bare count. */}
                <View className="gap-2 rounded-2xl border border-[#E4DCCB] bg-surface-subtle p-3">
                  {missing.map((item) => (
                    <View key={item.id} className="flex-row items-center gap-2">
                      <Ionicons name="basket-outline" size={15} color={colors.accentDark} />
                      <ScalableText
                        className="flex-1 text-sm font-medium text-ink"
                        numberOfLines={1}
                      >
                        {tl(item.name, item.nameZh)}
                      </ScalableText>
                      <ScalableText className="text-sm text-ink-muted">
                        {humanizeAmount(item.quantity, item.unit)}
                      </ScalableText>
                    </View>
                  ))}
                </View>

                {RETAILER_ORDER.map((id) => {
                  const cfg = RETAILERS[id];
                  const busy = exporting === id;
                  // An honest, static line about what each store can do for a multi-item list, driven
                  // by the one thing we actually know (its search engine), not an invented stock count.
                  const desc = cfg.supportsMultiTermSearch
                    ? tl("Searches your whole list at once", "一次過幫你搵晒成張單")
                    : tl("Search one item at a time", "逐樣慢慢搵");
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="button"
                      accessibilityLabel={`${tl(cfg.name, cfg.nameZh)}. ${desc}`}
                      disabled={exporting !== null}
                      onPress={() => handlePickStore(id)}
                      className="flex-row items-center gap-3 rounded-2xl border border-[#E4DCCB] p-3 active:opacity-80"
                    >
                      <View
                        className="h-11 w-11 items-center justify-center rounded-full"
                        style={{ backgroundColor: cfg.brandColor }}
                      >
                        <Ionicons name="storefront" size={20} color={colors.white} />
                      </View>
                      <View className="flex-1 gap-0.5">
                        <ScalableText className="text-base font-bold text-ink">
                          {tl(cfg.name, cfg.nameZh)}
                        </ScalableText>
                        <ScalableText className="text-sm font-medium text-ink-muted">
                          {desc}
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
                      "We'll copy the full list and open the store. Then search here one item at a time, and we'll tick each one when you come back.",
                      "我哋會複製成張清單再打開間鋪。之後喺呢度逐樣搵，每次返嚟就自動幫你剔。",
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
