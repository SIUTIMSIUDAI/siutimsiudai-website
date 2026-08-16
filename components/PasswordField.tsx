import { useMemo, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { checkPasswordRules, type PasswordRuleKey } from "@/utils/passwordSchema";

// One password input for the whole app: label, secure entry, the show/hide eye, the optional live
// strength checklist, and the error line. Four screens need this exact composition (sign-in,
// change password, reset password, and sign-up inside sign-in), and four copies of a security
// control is how they drift apart — one screen quietly loses `autoCapitalize="none"` and starts
// capitalising the first letter of every password typed into it.
//
// The eye toggle is deliberately per-field rather than lifted to the screen: on the change-password
// form the current and new passwords are independent, and revealing one should not reveal the other.

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3.5 py-3 text-base text-ink";

// A met rule reads green; an unmet one stays faint. Literal hex mirrors the auth screen style
// (the error banner already uses "#C0392B"), since the theme has no dedicated success token.
const RULE_MET = "#2E7D32";

// Password-rule keys -> localized checklist labels.
const RULE_LABEL_KEYS: Record<PasswordRuleKey, string> = {
  length: "auth.pwRuleLength",
  upper: "auth.pwRuleUpper",
  lower: "auth.pwRuleLower",
  number: "auth.pwRuleNumber",
  symbol: "auth.pwRuleSymbol",
};

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Localized error for this field, or null. */
  error?: string | null;
  /** Show the live strength checklist. Only for fields where a NEW password is being chosen. */
  showRules?: boolean;
  editable?: boolean;
  /**
   * Tells iOS/Android password managers what this field is. "current" offers the saved password;
   * "new" offers to generate and then save one. Getting this wrong is why some apps make you type a
   * generated password by hand.
   */
  autoComplete?: "current" | "new";
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
}

export function PasswordField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  showRules = false,
  editable = true,
  autoComplete = "current",
  returnKeyType,
  onSubmitEditing,
}: Props) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const isNew = autoComplete === "new";
  const rules = useMemo(
    () => (showRules ? checkPasswordRules(value ?? "") : []),
    [showRules, value],
  );

  return (
    <View className="gap-1.5">
      <ScalableText className="px-1 text-sm font-semibold text-ink-muted">{label}</ScalableText>

      <View className="flex-row items-center">
        <TextInput
          className={`${INPUT} flex-1 pr-11`}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!visible}
          textContentType={isNew ? "newPassword" : "password"}
          autoComplete={isNew ? "password-new" : "password"}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          onPress={() => setVisible((v) => !v)}
          className="absolute right-0 h-11 w-11 items-center justify-center"
        >
          <Ionicons name={visible ? "eye-off" : "eye"} size={20} color={colors.inkMuted} />
        </Pressable>
      </View>

      {/* Live strength checklist. Guides the user to a valid password before they submit, instead
          of bouncing them off a single error after the fact. */}
      {showRules && (
        <View accessibilityRole="summary" className="mt-1 gap-1 rounded-xl bg-surface-sunken px-3 py-2.5">
          <ScalableText className="text-xs font-semibold text-ink-muted">
            {t("auth.passwordChecklistTitle")}
          </ScalableText>
          {rules.map((rule) => (
            <View key={rule.key} className="flex-row items-center gap-2">
              <Ionicons
                name={rule.met ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={rule.met ? RULE_MET : colors.inkFaint}
              />
              <ScalableText className={`text-xs ${rule.met ? "text-ink-muted" : "text-ink-faint"}`}>
                {t(RULE_LABEL_KEYS[rule.key])}
              </ScalableText>
            </View>
          ))}
        </View>
      )}

      {error && <ScalableText className="px-1 text-xs text-[#C0392B]">{error}</ScalableText>}
    </View>
  );
}
