import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { visionFoodService } from "@/services";
import { recipeGenerationService } from "@/services/recipeGenerationService";
import { pickImageBase64 } from "@/utils/pickImageBase64";
import { useRecipeStore } from "@/stores/recipeStore";
import { Recipe } from "@/types";
import type { InvokeFailure } from "@/services";

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

type Phase = "idle" | "recognising" | "confirm" | "generating";

export function PhotoRecipeTab({ onCreated }: { onCreated: (recipe: Recipe) => void }) {
  const { tl } = useLocale();
  const access = useFeatureAccess("photo_recipe");
  const addRecipe = useRecipeStore((s) => s.addRecipe);

  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function capture(source: "camera" | "library") {
    setError(null);
    const shot = await pickImageBase64(source);
    if (shot.status === "cancel") return;
    if (shot.status === "denied") {
      setError(tl(
        "Camera access is off. Turn it on in Settings, or choose from your library.",
        "相機權限未開。去設定開啟，或者喺相簿揀相。",
      ));
      return;
    }
    if (shot.status === "error") {
      setError(tl("Couldn't open that photo. Try again.", "打唔開張相，再試下。"));
      return;
    }
    setPhase("recognising");
    const outcome = await visionFoodService.recognize(shot.base64);
    if (!outcome.ok) {
      setPhase("idle");
      setError(recogniseError(outcome.error));
      return;
    }
    const top = outcome.results[0]; // decision 6: top guess only; empty ⇒ type it
    setName(top?.name ?? "");
    setNameZh(top?.nameZh ?? "");
    setConfidence(top?.confidence ?? null);
    setPhase("confirm");
  }

  function recogniseError(reason: InvokeFailure): string {
    return reason === "rate_limited"
      ? tl(
          "You have used today's photo recognitions. Try again tomorrow.",
          "今日嘅相片辨識用晒喇，聽日再試。",
        )
      : tl("Couldn't read that photo. Try another shot.", "認唔到張相，換張相試下。");
  }

  async function generate() {
    if (!name.trim() && !nameZh.trim()) return;
    setPhase("generating");
    setError(null);
    const outcome = await recipeGenerationService.generateFromDish({
      name: name.trim() || nameZh.trim(),
      nameZh: nameZh.trim() || name.trim(),
    });
    if (!outcome.ok) {
      setPhase("confirm");
      setError(
        outcome.error === "rate_limited"
          ? tl(
              "You have used today's recipe generations. Try again tomorrow.",
              "今日嘅食譜生成用晒喇，聽日再試。",
            )
          : tl("Couldn't generate that recipe. Try again.", "整唔到食譜，再試下。"),
      );
      return;
    }
    onCreated(addRecipe(outcome.recipe, "photo"));
  }

  if (!access.hasAccess) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tl("Unlock recipe from a photo with Pro", "升級 Pro 解鎖影相整食譜")}
        onPress={access.triggerPaywall}
        className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4 active:opacity-80"
      >
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand/10">
            <Ionicons name="camera" size={20} color={colors.brand} />
          </View>
          <View className="flex-1">
            <ScalableText className="text-base font-bold text-ink">
              {tl("Snap a dish, get the recipe", "影張相，即刻有食譜")}
            </ScalableText>
            <ScalableText className="text-xs text-ink-muted">
              {tl(
                "Photograph any dish and the AI writes you a recipe to make it. A Pro perk.",
                "影低任何餸，AI 幫你寫返食譜。Pro 專享。",
              )}
            </ScalableText>
          </View>
        </View>
        <View className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3">
          <Ionicons name="lock-closed" size={14} color={colors.white} />
          <ScalableText className="text-sm font-bold text-white">
            {tl("Unlock with Pro", "升級 Pro 解鎖")}
          </ScalableText>
        </View>
      </Pressable>
    );
  }

  if (phase === "recognising" || phase === "generating") {
    return (
      <View className="items-center gap-3 py-8">
        <ActivityIndicator color={colors.brand} />
        <ScalableText className="text-sm text-ink-muted">
          {phase === "recognising"
            ? tl("Looking at your dish...", "望緊你張相...")
            : tl("Writing your recipe...", "幫緊你寫食譜...")}
        </ScalableText>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {phase === "idle" && (
        <>
          <ScalableText className="text-sm text-ink-muted">
            {tl(
              "Snap a dish or pick a photo, confirm what it is, and we'll write the recipe.",
              "影張餸相或者揀相，確認係咩餸，我哋幫你寫食譜。",
            )}
          </ScalableText>
          <Button label={tl("Snap a dish", "影張餸相")} icon="camera-outline" onPress={() => capture("camera")} />
          <Button
            label={tl("Choose from library", "喺相簿揀")}
            icon="images-outline"
            variant="secondary"
            onPress={() => capture("library")}
          />
        </>
      )}

      {phase === "confirm" && (
        <>
          <ScalableText className="text-sm font-semibold text-ink">
            {tl("Is this the dish? Edit if not.", "係唔係呢味餸？唔啱就改。")}
          </ScalableText>
          {confidence !== null && (
            <View className="self-start rounded-full bg-surface-sunken px-3 py-1">
              <ScalableText className="text-xs font-semibold text-ink-muted">
                {tl("Our guess", "我哋估")} · {Math.round(confidence * 100)}%
              </ScalableText>
            </View>
          )}
          <TextInput
            className={INPUT}
            value={name}
            onChangeText={setName}
            placeholder={tl("Dish name (English)", "餸名（英文）")}
            placeholderTextColor={colors.inkFaint}
          />
          <TextInput
            className={INPUT}
            value={nameZh}
            onChangeText={setNameZh}
            placeholder={tl("Dish name (中文)", "餸名（中文）")}
            placeholderTextColor={colors.inkFaint}
          />
          <Button label={tl("Generate recipe", "生成食譜")} icon="sparkles-outline" onPress={generate} />
        </>
      )}

      {error && (
        <View className="flex-row items-center gap-2 rounded-xl bg-brand-100 px-3 py-2">
          <Ionicons name="alert-circle" size={16} color={colors.brand} />
          <ScalableText className="flex-1 text-xs font-medium text-brand-700">{error}</ScalableText>
        </View>
      )}
    </View>
  );
}
