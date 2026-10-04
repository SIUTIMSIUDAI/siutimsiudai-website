import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { NamedFood, suggestionFit } from "@/utils/suggestionFit";
import { PantryItem, StructuredRecipe } from "@/types";

interface Props {
  // The current set of suggestions. Empty means the pantry can't make a full dish yet.
  recipes: StructuredRecipe[];
  // For each suggestion, the id it was saved under in the recipe box, or null if it hasn't been added.
  addedIds: Array<string | null>;
  pantry: PantryItem[];
  // A fresh set is on its way ("More ideas").
  loading: boolean;
  onAdd: (index: number) => void;
  onAddAll: () => void;
  onOpen: (recipeId: string) => void;
  onMore: () => void;
  onClose: () => void;
}

// The "Suggest recipes" results: every dish the pantry can make, side by side. Each one is added on
// its own and stays on screen as a highlighted "Added" with a link to open it, so picking one never
// hides the others. "Add all" saves whatever is left; "More ideas" asks for a different set.
export function RecipeSuggestions({
  recipes,
  addedIds,
  pantry,
  loading,
  onAdd,
  onAddAll,
  onOpen,
  onMore,
  onClose,
}: Props) {
  const { t, tl, locale } = useLocale();
  const join = (foods: NamedFood[]) =>
    foods.map((f) => tl(f.name, f.nameZh)).join(locale === "zh-Hant" ? "、" : ", ");
  const allAdded = addedIds.every((id) => id !== null);
  // Screen-reader labels pair an action with its dish: "Add to recipes: Steamed egg" / "加入食譜：蒸水蛋".
  const labelFor = (action: string, dish: string) =>
    `${action}${locale === "zh-Hant" ? "：" : ": "}${dish}`;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between pl-1">
        <ScalableText className="text-sm font-semibold text-ink-muted">
          {t("pantry.ideasTitle")}
        </ScalableText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("pantry.closeIdeas")}
          onPress={onClose}
          className="h-11 w-11 items-center justify-center active:opacity-70"
        >
          <Ionicons name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>

      {recipes.length === 0 ? (
        <View className="flex-row items-start gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
          <Ionicons name="basket-outline" size={18} color={colors.inkMuted} />
          <ScalableText className="flex-1 text-sm leading-5 text-ink">
            {t("pantry.nothingCookable")}
          </ScalableText>
        </View>
      ) : (
        <>
          {recipes.map((recipe, index) => {
            const fit = suggestionFit(recipe.ingredients, pantry);
            const savedId = addedIds[index];
            const title = tl(recipe.title, recipe.titleZh);
            return (
              <View
                key={`${index}-${recipe.title}`}
                className="gap-1.5 rounded-2xl border border-[#E4DCCB] bg-surface p-3"
              >
                <View>
                  <ScalableText className="text-base font-bold text-ink">{title}</ScalableText>
                  <ScalableText className="text-xs text-ink-muted">
                    {tl(recipe.titleZh, recipe.title)}
                  </ScalableText>
                </View>
                <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
                    <ScalableText className="text-xs text-ink-muted">
                      {tl(`${recipe.totalMinutes} min`, `${recipe.totalMinutes} 分鐘`)}
                    </ScalableText>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="people-outline" size={14} color={colors.inkMuted} />
                    <ScalableText className="text-xs text-ink-muted">
                      {recipe.servings} {t("recipes.servings")}
                    </ScalableText>
                  </View>
                </View>
                {fit.uses.length > 0 ? (
                  <ScalableText className="text-sm leading-5 text-ink">
                    {t("pantry.uses", { list: join(fit.uses) })}
                  </ScalableText>
                ) : null}
                {fit.alsoNeeds.length > 0 ? (
                  <View className="flex-row items-start gap-1.5">
                    <Ionicons name="alert-circle" size={16} color={colors.accent} />
                    <ScalableText className="flex-1 text-sm leading-5 text-ink">
                      {t("pantry.alsoNeeds", { list: join(fit.alsoNeeds) })}
                    </ScalableText>
                  </View>
                ) : null}

                <View className="mt-1 flex-row flex-wrap items-center gap-2">
                  {savedId ? (
                    <>
                      <View
                        accessible
                        accessibilityLabel={labelFor(t("pantry.added"), title)}
                        className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl border border-jade/40 bg-jade/10 px-4"
                      >
                        <Ionicons name="checkmark-circle" size={18} color={colors.jade} />
                        <ScalableText className="text-sm font-semibold text-ink">
                          {t("pantry.added")}
                        </ScalableText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={labelFor(t("pantry.open"), title)}
                        onPress={() => onOpen(savedId)}
                        className="min-h-[44px] flex-row items-center gap-1 px-2 active:opacity-70"
                      >
                        <ScalableText className="text-sm font-semibold text-brand">
                          {t("pantry.open")}
                        </ScalableText>
                        <Ionicons name="chevron-forward" size={16} color={colors.brand} />
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={labelFor(t("pantry.addRecipe"), title)}
                      onPress={() => onAdd(index)}
                      className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl bg-brand px-4 active:opacity-80"
                    >
                      <Ionicons name="add" size={18} color={colors.white} />
                      <ScalableText className="text-sm font-semibold text-white">
                        {t("pantry.addRecipe")}
                      </ScalableText>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              icon="add-circle-outline"
              label={t("pantry.addAll")}
              disabled={allAdded}
              onPress={onAddAll}
            />
            <Button
              className="flex-1"
              variant="secondary"
              icon="sparkles"
              label={t("pantry.moreIdeas")}
              loading={loading}
              onPress={onMore}
            />
          </View>
        </>
      )}
    </View>
  );
}
