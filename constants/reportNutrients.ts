import { colors, macroColors, microColors } from "@/constants/theme";
import { TRACKED_MICRO_META } from "@/utils/micros";
import { ReportNutrientKey } from "@/utils/nutritionReport";

// How each nutrient in the History report is named and coloured. Calories wear the brand milk tea;
// the macros and micros keep the colours they already wear on the dashboard, so a nutrient looks the
// same everywhere in the app.
export const NUTRIENT_COLORS: Record<ReportNutrientKey, string> = {
  calories: colors.brand,
  protein: macroColors.protein,
  carbs: macroColors.carbs,
  fat: macroColors.fat,
  fiber: macroColors.fiber,
  iron: microColors.iron,
  calcium: microColors.calcium,
  potassium: microColors.potassium,
  sodium: microColors.sodium,
  vitaminC: microColors.vitaminC,
  vitaminD: microColors.vitaminD,
};

export const NUTRIENT_LABELS: Record<ReportNutrientKey, { label: string; labelZh: string }> = {
  calories: { label: "Calories", labelZh: "卡路里" },
  protein: { label: "Protein", labelZh: "蛋白質" },
  carbs: { label: "Carbs", labelZh: "碳水" },
  fat: { label: "Fat", labelZh: "脂肪" },
  fiber: { label: "Fibre", labelZh: "纖維" },
  iron: TRACKED_MICRO_META.iron,
  calcium: TRACKED_MICRO_META.calcium,
  potassium: TRACKED_MICRO_META.potassium,
  sodium: TRACKED_MICRO_META.sodium,
  vitaminC: TRACKED_MICRO_META.vitaminC,
  vitaminD: TRACKED_MICRO_META.vitaminD,
};
