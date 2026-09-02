import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { HEALTH_DEFAULTS, HealthProfileForm } from "@/components/HealthProfileForm";
import { SourcesLink } from "@/components/SourcesLink";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useNutritionStore } from "@/stores/nutritionStore";
import { setMyDisplayName } from "@/services/profileService";
import { normaliseDisplayName } from "@/utils/displayName";
import { normalizeHealthProfile } from "@/utils/nutritionTargets";
import { HealthProfile } from "@/types";

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

// Post-authentication landing screen: the health profile setup. Saving (or skipping to sensible
// defaults) writes a non-null healthProfile, which is exactly what the route gate checks before
// letting the user into the app. Reuses the shared HealthProfileForm so this stays in lockstep
// with the in-app editor.
export default function ProfileSetupScreen() {
  const { t } = useLocale();
  const existing = useNutritionStore((s) => s.healthProfile);
  const setHealthProfile = useNutritionStore((s) => s.setHealthProfile);
  const [draft, setDraft] = useState<HealthProfile>(existing ?? HEALTH_DEFAULTS);
  // "How should we call you?" — the name shown to family members later. Optional: a first-run user is
  // nameless, so there is nothing to prefill here (unlike the Profile tab, which loads the saved one).
  const [name, setName] = useState("");

  function commit(profile: HealthProfile) {
    // setHealthProfile also seeds the daily calorie target, so the dashboard ring is right on
    // arrival. A non-null profile flips the gate's last step and routes into the app.
    setHealthProfile(normalizeHealthProfile(profile));
    // Save the name on both "Save and continue" and "Skip": if they typed one, keep it; if they left
    // it blank, there is nothing to store. Fire-and-forget so a slow network never blocks the gate,
    // and swallow errors because the name is editable later in the Profile tab.
    const clean = normaliseDisplayName(name);
    if (clean) void setMyDisplayName(clean).catch(() => {});
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="gap-3 px-5 pb-3 pt-4">
        <View>
          <ScalableText className="text-2xl font-bold text-ink">{t("profileSetup.title")}</ScalableText>
          <ScalableText className="mt-1 text-base leading-6 text-ink-muted">
            {t("profileSetup.subtitle")}
          </ScalableText>
        </View>
        {/* This screen is the first time we turn someone's body metrics into a calorie target, so
            the caveat and the citations belong here, above the form rather than after it. Kept out
            of the ScrollView so it cannot be missed by not scrolling. */}
        <SourcesLink variant="note" />
      </View>

      <ScrollView
        className="flex-1 px-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* First run: calories + macros preview shows for everyone, but the premium vitamins &
            minerals panel is hidden for free users (freeMicros="hidden"). The route gate keeps the
            user pinned here until a profile is saved, so the subscription modal can't open over this
            screen — an inert lock/upsell would be a dead link. The tappable upsell lives on the
            profile-tab "Nutrition needs" sheet, where /subscription is actually reachable. */}
        {/* Name first: it is the friendliest thing to ask and sets the tone before the metrics. */}
        <View className="gap-1 pt-1 pb-4">
          <ScalableText className="text-base font-semibold text-ink">{t("profile.nameLabel")}</ScalableText>
          <TextInput
            className={INPUT}
            value={name}
            onChangeText={setName}
            placeholder={t("profile.namePlaceholder")}
            placeholderTextColor={colors.inkFaint}
            maxLength={40}
            returnKeyType="done"
          />
        </View>
        <HealthProfileForm initial={existing} onChange={setDraft} freeMicros="hidden" />
        <View className="h-4" />
      </ScrollView>

      <View className="gap-2 border-t border-[#E4DCCB] bg-surface px-5 pb-4 pt-3">
        <Button label={t("profileSetup.saveContinue")} icon="checkmark" onPress={() => commit(draft)} />
        <Button label={t("profileSetup.skip")} variant="ghost" onPress={() => commit(HEALTH_DEFAULTS)} />
      </View>
    </Screen>
  );
}
