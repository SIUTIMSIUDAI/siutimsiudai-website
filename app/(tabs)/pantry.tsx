import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { PantryItemRow } from "@/components/PantryItemRow";
import { GroceryItemRow } from "@/components/GroceryItemRow";
import { AddPantryItemSheet } from "@/components/AddPantryItemSheet";
import { GroceryCompileSheet } from "@/components/GroceryCompileSheet";
import { RecipeSuggestions } from "@/components/RecipeSuggestions";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useAppStore } from "@/stores/appStore";
import { useRecipeStore } from "@/stores/recipeStore";
import { usePantryStore } from "@/stores/pantryStore";
import { useGroceryStore } from "@/stores/groceryStore";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { recipeGenerationService } from "@/services/recipeGenerationService";
import type { InvokeFailure } from "@/services/functionError";
import type { StructuredRecipe } from "@/types";

export default function PantryScreen() {
  const { t, tl } = useLocale();
  const system = useAppStore((s) => s.measurementSystem);

  const recipes = useRecipeStore((s) => s.recipes);
  const items = usePantryStore((s) => s.items);
  const toggleInStock = usePantryStore((s) => s.toggleInStock);
  const removeItem = usePantryStore((s) => s.removeItem);
  const cookableRecipes = usePantryStore((s) => s.cookableRecipes);

  const list = useGroceryStore((s) => s.list);
  const toggleGrocery = useGroceryStore((s) => s.toggleItem);
  const clearGrocery = useGroceryStore((s) => s.clear);

  // "Suggest recipes" generates fresh recipes with AI, so it's a paid perk (Pro and Max). Free
  // users see the button with a lock and land on the paywall when they tap it.
  const { hasAccess: canSuggest, triggerPaywall } = useFeatureAccess("pantry_suggest");
  // The AI scan, fridge photo or receipt, is a paid perk too (owner decision 2026-10-08).
  const scanAccess = useFeatureAccess("pantry_scan");

  const [addOpen, setAddOpen] = useState(false);
  const [compileOpen, setCompileOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Why the generation failed, not merely that it did. "rate_limited" is the daily per-user cap,
  // where tapping again cannot work and saying "try again" would be a lie.
  const [suggestFailed, setSuggestFailed] = useState<InvokeFailure | null>(null);
  // The suggestions on screen (null when none are), and every title shown since they opened, so
  // "More ideas" can ask for different dishes.
  const [suggestions, setSuggestions] = useState<StructuredRecipe[] | null>(null);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);
  // What each suggestion was saved as once added. Mirrored in a ref so a quick double tap reads the
  // first tap's result and never saves the same dish twice.
  const [addedIds, setAddedIdsState] = useState<Array<string | null>>([]);
  const addedRef = useRef<Array<string | null>>([]);
  const setAddedIds = (next: Array<string | null>) => {
    addedRef.current = next;
    setAddedIdsState(next);
  };

  // Recompute the highlight whenever stock or the recipe set changes.
  const cookable = useMemo(() => cookableRecipes(recipes), [cookableRecipes, recipes, items]);
  const openRecipe = (id: string) => router.push({ pathname: "/recipe/[id]", params: { id } });
  const remaining = list ? list.items.filter((it) => !it.checked).length : 0;
  const inStock = useMemo(() => items.filter((it) => it.inStock), [items]);

  // Up to three dishes from whatever is in stock (NOT tailored to any nutrition target), shown as
  // cards to add one at a time or all at once. One AI use per tap, "More ideas" included. The
  // generation runs server-side on Vertex AI when Supabase is configured; a local template answers
  // ONLY in Expo Go / web / tests, where there is no backend to call at all.
  //
  // A failure saves nothing and leaves whatever was already showing. This is a paid Pro/Max perk, so
  // serving the template on failure would sell AI output no model produced, and once added to the
  // recipe box the fake would sit there afterwards looking like a genuine suggestion.
  // Set synchronously, unlike `generating`, so a quick double tap can't spend two AI uses.
  const inFlight = useRef(false);
  async function suggestRecipes(more: boolean) {
    if (inFlight.current || inStock.length === 0) return;
    inFlight.current = true;
    setGenerating(true);
    setSuggestFailed(null);
    try {
      const seen = more ? seenTitles : [];
      const outcome = await recipeGenerationService.suggest(
        inStock.map((it) => ({ name: it.name, nameZh: it.nameZh, quantity: it.quantity, unit: it.unit })),
        seen.slice(-12),
      );
      if (!outcome.ok) {
        setSuggestFailed(outcome.error);
        return;
      }
      setSuggestions(outcome.recipes);
      setAddedIds(outcome.recipes.map(() => null));
      setSeenTitles([...seen, ...outcome.recipes.map((r) => r.title)]);
    } finally {
      inFlight.current = false;
      setGenerating(false);
    }
  }

  // Only a saved id still in the recipe box counts as added, so a recipe deleted since can be added
  // again instead of opening to "not found".
  const liveAddedIds = useMemo(
    () => addedIds.map((id) => (id && recipes.some((r) => r.id === id) ? id : null)),
    [addedIds, recipes],
  );
  function currentAddedIds(): Array<string | null> {
    const box = useRecipeStore.getState().recipes;
    return addedRef.current.map((id) => (id && box.some((r) => r.id === id) ? id : null));
  }

  function addSuggestion(index: number) {
    if (!suggestions) return;
    const added = currentAddedIds();
    if (added[index]) return;
    added[index] = useRecipeStore.getState().addRecipe(suggestions[index], "manual").id;
    setAddedIds(added);
  }

  function addAllSuggestions() {
    if (!suggestions) return;
    setAddedIds(
      currentAddedIds().map(
        (id, i) => id ?? useRecipeStore.getState().addRecipe(suggestions[i], "manual").id,
      ),
    );
  }

  function closeSuggestions() {
    setSuggestions(null);
    setAddedIds([]);
    setSeenTitles([]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 20 }}>
        <ScalableText className="text-2xl font-bold text-ink">{t("pantry.title")}</ScalableText>

        {/* AI actions: snap the kitchen to fill the pantry, or turn what's in stock into a recipe. */}
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              label={t("pantry.scan")}
              icon={scanAccess.hasAccess ? "camera" : "lock-closed"}
              onPress={scanAccess.hasAccess ? () => router.push("/pantry-scan") : scanAccess.triggerPaywall}
              accessibilityLabel={
                scanAccess.hasAccess ? t("pantry.scan") : tl("Scan, unlock with Pro", "掃描，升級 Pro 解鎖")
              }
            />
            <Button
              className="flex-1"
              variant="secondary"
              label={t("pantry.suggest")}
              icon={canSuggest ? "sparkles" : "lock-closed"}
              loading={generating}
              disabled={canSuggest && inStock.length === 0}
              onPress={canSuggest ? () => void suggestRecipes(false) : triggerPaywall}
              accessibilityLabel={
                canSuggest
                  ? t("pantry.suggest")
                  : tl("Suggest recipes, unlock with Pro", "推介食譜，升級 Pro 解鎖")
              }
            />
          </View>

          {/* Three full recipes take longer than one, so say something is happening. */}
          {generating ? (
            <ScalableText accessibilityLiveRegion="polite" className="px-1 text-xs text-ink-muted">
              {t("pantry.suggesting")}
            </ScalableText>
          ) : null}

          {/* Honest failure state. Nothing was saved, so the button above is the retry — unless the
              reason was the daily cap, in which case tapping again cannot help and we say so. */}
          {suggestFailed && !generating && (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
            >
              <Ionicons name="alert-circle-outline" size={18} color={colors.inkMuted} />
              <ScalableText className="flex-1 text-sm leading-5 text-ink">
                {t(
                  suggestFailed === "rate_limited"
                    ? "pantry.suggestRateLimited"
                    : "pantry.suggestFailed",
                )}
              </ScalableText>
            </View>
          )}
        </View>

        {suggestions ? (
          <RecipeSuggestions
            recipes={suggestions}
            addedIds={liveAddedIds}
            pantry={items}
            loading={generating}
            onAdd={addSuggestion}
            onAddAll={addAllSuggestions}
            onOpen={openRecipe}
            onMore={() => void suggestRecipes(true)}
            onClose={closeSuggestions}
          />
        ) : null}

        {cookable.length > 0 && (
          <View className="gap-2">
            <View className="px-1">
              <ScalableText className="text-sm font-semibold text-ink-muted">
                {t("pantry.cookNow")}
              </ScalableText>
              <ScalableText className="text-xs text-ink-faint">{t("pantry.cookNowHint")}</ScalableText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}
            >
              {cookable.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={tl(r.title, r.titleZh)}
                  onPress={() => openRecipe(r.id)}
                  className="w-40 gap-1 rounded-2xl border border-jade/40 bg-jade/10 p-3 active:opacity-80"
                >
                  <Ionicons name="flame" size={18} color={colors.jade} />
                  <ScalableText className="text-sm font-bold text-ink" numberOfLines={2}>
                    {tl(r.title, r.titleZh)}
                  </ScalableText>
                  <ScalableText className="text-xs text-ink-muted">
                    {r.totalMinutes} {tl("min", "分鐘")}
                  </ScalableText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <ScalableText className="text-sm font-semibold text-ink-muted">
              {t("grocery.title")}
            </ScalableText>
            {list && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tl("Clear list", "清除清單")}
                onPress={clearGrocery}
                className="h-9 flex-row items-center gap-1 px-1"
              >
                <Ionicons name="trash-outline" size={14} color={colors.inkMuted} />
                <ScalableText className="text-xs font-semibold text-ink-muted">
                  {tl("Clear", "清除")}
                </ScalableText>
              </Pressable>
            )}
          </View>
          <View className="rounded-2xl border border-[#E4DCCB] bg-surface p-4">
            {!list || list.items.length === 0 ? (
              <View className="items-center gap-3 py-2">
                <ScalableText className="text-center text-sm text-ink-muted">
                  {t("grocery.empty")}
                </ScalableText>
                <Button
                  label={t("grocery.compile")}
                  icon="cart-outline"
                  onPress={() => setCompileOpen(true)}
                />
              </View>
            ) : (
              <View className="gap-1">
                <ScalableText className="text-xs text-ink-faint">
                  {t("grocery.items", { count: list.items.length })} · {remaining} {tl("left", "未買")}
                </ScalableText>
                {list.items.map((it) => (
                  <GroceryItemRow
                    key={it.id}
                    item={it}
                    system={system}
                    onToggle={() => toggleGrocery(it.id)}
                  />
                ))}
                <View className="pt-2">
                  <Button
                    label={t("grocery.compile")}
                    icon="refresh"
                    variant="secondary"
                    onPress={() => setCompileOpen(true)}
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <ScalableText className="text-sm font-semibold text-ink-muted">
              {t("pantry.title")}
            </ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("pantry.add")}
              onPress={() => setAddOpen(true)}
              className="h-9 flex-row items-center gap-1 rounded-full bg-surface-sunken px-3 active:opacity-70"
            >
              <Ionicons name="add" size={16} color={colors.ink} />
              <ScalableText className="text-xs font-semibold text-ink">{t("pantry.add")}</ScalableText>
            </Pressable>
          </View>
          <View className="rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-1">
            {items.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("pantry.add")}
                onPress={() => setAddOpen(true)}
                className="items-center gap-3 py-7 active:opacity-80"
              >
                <Ionicons name="basket-outline" size={32} color={colors.inkFaint} />
                <ScalableText className="text-center text-sm text-ink-muted">
                  {t("pantry.empty")}
                </ScalableText>
                <View className="flex-row items-center gap-1.5 rounded-full bg-brand px-4 py-2">
                  <Ionicons name="add" size={16} color={colors.white} />
                  <ScalableText className="text-sm font-bold text-white">
                    {t("pantry.add")}
                  </ScalableText>
                </View>
              </Pressable>
            ) : (
              items.map((it) => (
                <PantryItemRow
                  key={it.id}
                  item={it}
                  system={system}
                  onToggle={() => toggleInStock(it.id)}
                  onRemove={() => removeItem(it.id)}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <AddPantryItemSheet visible={addOpen} onClose={() => setAddOpen(false)} />
      <GroceryCompileSheet visible={compileOpen} onClose={() => setCompileOpen(false)} />
    </Screen>
  );
}
