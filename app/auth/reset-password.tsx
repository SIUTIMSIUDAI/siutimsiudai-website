import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";
import { setNewPassword } from "@/services/authService";
import { authErrorKey, fieldErrorKey } from "@/utils/authErrorCopy";
import { resetPasswordSchema, type ResetPasswordValues } from "@/utils/passwordChangeSchema";

// Step two of password recovery. The user arrives here already signed in — a recovery link
// establishes a session as a side effect — and the route gate pins them here (authStore
// .recoveryPending) so they cannot wander into the app leaving the forgotten password in place.
//
// No current password is asked for, and that is the point rather than an oversight: the emailed
// link is the proof of identity, and the person on this screen is here precisely because they
// cannot supply the old one.
export default function ResetPasswordScreen() {
  const { t } = useLocale();
  const endRecovery = useAuthStore((s) => s.endRecovery);
  const storeSignOut = useAuthStore((s) => s.signOut);
  const email = useAuthStore((s) => s.user?.email ?? "");

  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    defaultValues: { next: "", confirm: "" },
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
  });

  const fieldError = (name: keyof ResetPasswordValues): string | null => {
    const key = fieldErrorKey(errors[name]?.message);
    return key ? t(key) : null;
  };

  async function onValid(values: ResetPasswordValues) {
    setServerError(null);
    setBusy(true);
    const res = await setNewPassword(values.next);
    setBusy(false);

    if (!res.ok) {
      setServerError(t(authErrorKey(res.error)));
      return;
    }
    // Release the gate. The session is already live, so clearing the flag drops the user straight
    // into the app (or profile setup, if this is a fresh account) with no second sign-in.
    endRecovery();
  }

  async function abandon() {
    // Signing out is the honest exit: it clears the recovery flags via applySession(null) and
    // returns to sign-in. Silently releasing the gate instead would leave someone inside an account
    // whose password they still do not know, one session expiry away from being locked out again.
    await storeSignOut();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-7 items-center">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-ink">
              <Ionicons name="lock-open" size={26} color={colors.white} />
            </View>
            <ScalableText className="text-2xl font-bold text-ink">
              {t("auth.resetTitle")}
            </ScalableText>
            <ScalableText className="mt-1 text-center text-base leading-6 text-ink-muted">
              {email ? t("auth.resetSubtitleFor", { email }) : t("auth.resetSubtitle")}
            </ScalableText>
          </View>

          <View className="gap-4">
            <Controller
              control={control}
              name="next"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  label={t("auth.newPasswordLabel")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("auth.newPasswordPlaceholder")}
                  error={fieldError("next")}
                  showRules
                  autoComplete="new"
                  editable={!busy}
                />
              )}
            />

            <Controller
              control={control}
              name="confirm"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  label={t("auth.confirmPasswordLabel")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  error={fieldError("confirm")}
                  autoComplete="new"
                  editable={!busy}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onValid)}
                />
              )}
            />

            {serverError && (
              <View className="flex-row items-start gap-2 rounded-xl bg-[#FBEAE7] px-3 py-2.5">
                <Ionicons name="alert-circle" size={18} color="#C0392B" />
                <ScalableText className="flex-1 text-sm text-[#C0392B]">{serverError}</ScalableText>
              </View>
            )}

            <View className="flex-row items-start gap-2 rounded-xl bg-surface-sunken px-3 py-2.5">
              <Ionicons name="shield-checkmark" size={18} color={colors.inkMuted} />
              <ScalableText className="flex-1 text-xs text-ink-muted">
                {t("auth.otherDevicesNotice")}
              </ScalableText>
            </View>

            <Button
              label={t("auth.setNewPassword")}
              onPress={handleSubmit(onValid)}
              loading={busy}
            />
            <Button
              label={t("auth.backToSignIn")}
              variant="ghost"
              onPress={() => void abandon()}
              disabled={busy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
