import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { EditUsualSheet } from "@/components/EditUsualSheet";
import { SourcesLink } from "@/components/SourcesLink";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatCalories } from "@/utils/formatters";
import { useSavedMealsStore } from "@/stores/savedMealsStore";
import type { SavedMeal } from "@/types";

// Manage "The usual": the full list of saved quick-add templates, each editable (opens the edit
// sheet) or removable. Reached from the QuickAddRow header on the dashboard. Delete also lives on
// the dashboard chips (long-press) but this screen is where a user tidies the whole set.
export function ManageUsualsScreen() {
  const { t, tl } = useLocale();
  const meals = useSavedMealsStore((s) => s.meals);
  const updateMeal = useSavedMealsStore((s) => s.updateMeal);
  const removeMeal = useSavedMealsStore((s) => s.removeMeal);
  const [editing, setEditing] = useState<SavedMeal | null>(null);

  // Confirm before dropping a usual so a stray tap never silently deletes a habit.
  function confirmRemove(meal: SavedMeal) {
    Alert.alert(
      tl("Remove from The usual?", "移除呢個老規矩？"),
      tl(
        `"${meal.name}" won't show up here anymore.`,
        `「${meal.nameZh || meal.name}」以後唔會再喺呢度出現。`,
      ),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: tl("Remove", "移除"),
          style: "destructive",
          onPress: () => removeMeal(meal.id),
        },
      ],
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-1 px-3 pb-2 pt-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tl("Back", "返回")}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <ScalableText className="text-2xl font-bold text-ink" numberOfLines={1}>
          {tl("Manage The usual", "管理老規矩")}
        </ScalableText>
      </View>

      {meals.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Ionicons name="star-outline" size={32} color={colors.inkFaint} />
          <ScalableText className="text-center text-base text-ink-muted">
            {tl(
              "No usuals yet. Pin a meal from the log to add it here.",
              "未有老規矩。喺記錄度加入一餐就會喺呢度出現。",
            )}
          </ScalableText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40, gap: 16 }}>
          <ScalableText className="px-1 text-sm text-ink-muted">
            {tl(
              "Tap a usual to edit it, or remove one you no longer eat.",
              "㩒一下就可以改，唔再食嘅可以移除。",
            )}
          </ScalableText>

          <View className="rounded-2xl border border-[#E4DCCB] bg-surface px-4">
            {meals.map((m) => (
              <View
                key={m.id}
                className="flex-row items-center gap-2 border-b border-[#E8E1D2] py-1"
              >
                <Pressable
                  onPress={() => setEditing(m)}
                  accessibilityRole="button"
                  accessibilityLabel={tl(`Edit ${m.name}`, `改「${m.nameZh || m.name}」`)}
                  className="min-h-[44px] flex-1 flex-row items-center gap-3 py-2 active:opacity-70"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
                    <Ionicons name="star" size={16} color={colors.brand} />
                  </View>
                  <View className="flex-1">
                    <ScalableText className="text-base font-semibold text-ink" numberOfLines={1}>
                      {tl(m.name, m.nameZh)}
                    </ScalableText>
                    <ScalableText className="text-xs text-ink-muted">
                      {t(`mealType.${m.defaultMealType}`)} · {formatCalories(m.calories)} kcal
                    </ScalableText>
                  </View>
                  <Ionicons name="pencil" size={16} color={colors.inkFaint} />
                </Pressable>
                <Pressable
                  onPress={() => confirmRemove(m)}
                  accessibilityRole="button"
                  accessibilityLabel={tl(`Remove ${m.name}`, `移除「${m.nameZh || m.name}」`)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
          </View>

          {/* The rows state calorie figures, so the citations link travels with them (Guideline 1.4.1). */}
          <SourcesLink />
        </ScrollView>
      )}

      <EditUsualSheet
        visible={editing !== null}
        meal={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return "updated";
          const result = updateMeal(editing.id, patch);
          // Close only on a real update; a name clash keeps the sheet open to show its warning.
          if (result === "updated") setEditing(null);
          return result;
        }}
      />
    </Screen>
  );
}
