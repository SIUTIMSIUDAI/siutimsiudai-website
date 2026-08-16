import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
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
import { changePassword } from "@/services/authService";
import { authErrorKey, fieldErrorKey } from "@/utils/authErrorCopy";
import { changePasswordSchema, type ChangePasswordValues } from "@/utils/passwordChangeSchema";

// Change your password from inside the app. Reached from Profile, and only shown to accounts that
// actually have a password (see utils/authIdentity — an Apple/Google account has none).
//
// The current password is required. Supabase would happily accept a new one without it, but a live
// session is not proof of intent: a phone left unlocked on a cafe table is a live session. Asking
// for the old password is the whole security value of this screen. The check runs in
// authService.changePassword, which also signs out every other device on success.
export default function ChangePasswordScreen() {
  const { t } = useLocale();
  const userEmail = useAuthStore((s) => s.user?.email ?? "");

  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    defaultValues: { current: "", next: "", confirm: "" },
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
  });

  const fieldError = (name: keyof ChangePasswordValues): string | null => {
    const key = fieldErrorKey(errors[name]?.message);
    return key ? t(key) : null;
  };

  async function onValid(values: ChangePasswordValues) {
    setServerError(null);
    setBusy(true);
    const res = await changePassword(values.current, values.next);
    setBusy(false);

    if (!res.ok) {
      setServerError(t(authErrorKey(res.error)));
      // Clear the passwords on a failed attempt so a rejected value is not left sitting in a
      // visible field, and so the next try starts clean rather than re-submitting the same thing.
      setValue("current", "");
      setValue("next", "");
      setValue("confirm", "");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View className="flex-1 justify-center px-6">
          <View className="items-center">
            <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-[#E7F4EC]">
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            </View>
            <ScalableText className="text-2xl font-bold text-ink">
              {t("auth.changeDoneTitle")}
            </ScalableText>
            <ScalableText className="mt-2 text-center text-base leading-6 text-ink-muted">
              {t("auth.changeDoneBody")}
            </ScalableText>
          </View>
          <View className="mt-8">
            <Button label={t("common.done")} onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              onPress={() => router.back()}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              disabled={busy}
            >
              <Ionicons name="chevron-back" size={24} color={colors.ink} />
            </Pressable>
            <ScalableText className="text-2xl font-bold text-ink">
              {t("auth.changeTitle")}
            </ScalableText>
          </View>

          {!!userEmail && (
            <ScalableText className="mb-5 px-1 text-sm text-ink-muted" numberOfLines={1}>
              {userEmail}
            </ScalableText>
          )}

          <View className="gap-4">
            <Controller
              control={control}
              name="current"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  label={t("auth.currentPasswordLabel")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("auth.currentPasswordPlaceholder")}
                  error={fieldError("current")}
                  autoComplete="current"
                  editable={!busy}
                />
              )}
            />

            {/* Sits directly under the current-password field, where someone who has just realised
                they cannot fill it in is actually looking. */}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                router.push(
                  userEmail
                    ? `/auth/forgot-password?email=${encodeURIComponent(userEmail)}`
                    : "/auth/forgot-password",
                )
              }
              className="-mt-2 min-h-[44px] justify-center self-start px-1"
            >
              <ScalableText className="text-sm font-semibold text-brand">
                {t("auth.forgotPassword")}
              </ScalableText>
            </Pressable>

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
              label={t("auth.changeSubmit")}
              onPress={handleSubmit(onValid)}
              loading={busy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
