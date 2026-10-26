import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";
import type { TFunction } from "i18next";
import { ScalableText } from "@/components/ScalableText";
import { PlanSheet } from "@/components/familyPlan/PlanSheet";
import { colors } from "@/constants/theme";
import type { HelperLanguage, MyPlanSettings } from "@/types/familyPlan";
import { HELPER_LANGUAGE_NAMES } from "./helperText";

interface Props {
  visible: boolean;
  ht: TFunction;
  me: MyPlanSettings;
  busy: boolean;
  error: string | null;
  onSave: (me: MyPlanSettings) => void;
  onClose: () => void;
}

const LANGUAGES: HelperLanguage[] = ["en", "fil", "id"];

/** The helper's own choices: her language, and whether her employer may see her food diary (off). */
export function HelperSettingsSheet({ visible, ht, me, busy, error, onSave, onClose }: Props) {
  const [language, setLanguage] = useState<HelperLanguage>(me.helperLanguage);
  const [sharesLog, setSharesLog] = useState(me.sharesLog);

  useEffect(() => {
    if (!visible) return;
    setLanguage(me.helperLanguage);
    setSharesLog(me.sharesLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <PlanSheet
      visible={visible}
      title={ht("helper.settingsTitle")}
      closeLabel={ht("helper.close")}
      onClose={onClose}
      footer={
        <View className="mt-3 gap-2">
          {error && <ScalableText className="text-sm text-[#B4442E]">{error}</ScalableText>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ht("helper.save")}
            disabled={busy}
            onPress={() => onSave({ ...me, helperLanguage: language, sharesLog })}
            className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-80"
          >
            {busy && <ActivityIndicator size="small" color={colors.white} />}
            <ScalableText className="text-base font-bold text-white">{ht("helper.save")}</ScalableText>
          </Pressable>
        </View>
      }
    >
      <View className="gap-5 pb-2">
        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink">{ht("helper.language")}</ScalableText>
          <View className="flex-row flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <Pressable
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ selected: language === l }}
                accessibilityLabel={HELPER_LANGUAGE_NAMES[l]}
                onPress={() => setLanguage(l)}
                className={`min-h-[40px] items-center justify-center rounded-full border px-4 ${
                  language === l ? "border-brand bg-brand" : "border-[#E4DCCB] bg-surface"
                } active:opacity-80`}
              >
                <ScalableText className={`text-sm font-semibold ${language === l ? "text-white" : "text-ink"}`}>
                  {HELPER_LANGUAGE_NAMES[l]}
                </ScalableText>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center gap-3">
            <ScalableText className="flex-1 text-sm font-semibold text-ink">{ht("helper.shareLog")}</ScalableText>
            <Switch
              accessibilityLabel={ht("helper.shareLog")}
              value={sharesLog}
              onValueChange={setSharesLog}
              trackColor={{ true: colors.brand, false: colors.surfaceSunken }}
            />
          </View>
          <ScalableText className="text-xs leading-5 text-ink-muted">{ht("helper.shareLogHint")}</ScalableText>
        </View>
      </View>
    </PlanSheet>
  );
}
