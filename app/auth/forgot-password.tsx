import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/services/supabase";
import { sendPasswordReset } from "@/services/authService";
import { authErrorKey } from "@/utils/authErrorCopy";
import { emailSchema } from "@/utils/passwordSchema";

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3.5 py-3 text-base text-ink";

// Step one of password recovery: prove you can receive mail at the address. The emailed link comes
// back through app/auth/callback.tsx, which flips the recovery flag and lets the route gate hold
// the user on the reset screen until a new password is actually set.
//
// The confirmation is deliberately identical whether or not an account exists. A screen that says
// "no account with that email" is a free membership check for anyone who wants to know which
// addresses are registered here, and it buys the honest user nothing they cannot learn by opening
// their inbox. Supabase behaves the same way at the API, so this is not a fiction the client
// maintains on its own.
//
// Copy here follows the auth/system rule: plain and trustworthy, no Cantonese slang. Somebody
// locked out of their account is not in the mood for jokes.
export default function ForgotPasswordScreen() {
  const { t } = useLocale();
  const params = useLocalSearchParams<{ email?: string }>();
  const markRecoveryRequested = useAuthStore((s) => s.markRecoveryRequested);

  // Pre-filled from the sign-in screen when they had already typed an address.
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t("auth.errEmailInvalid"));
      return;
    }
    setError(null);
    setBusy(true);
    const res = await sendPasswordReset(parsed.data);
    setBusy(false);

    if (!res.ok) {
      setError(t(authErrorKey(res.error)));
      return;
    }
    // Remember that a reset was asked for on this device. Under PKCE the returning link can arrive
    // as a bare ?code= with no type on it, and this is what tells the callback screen that the
    // session it just established is a recovery rather than a plain sign-in.
    markRecoveryRequested();
    setSent(true);
  }

  if (sent) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View className="flex-1 justify-center px-6">
          <View className="items-center">
            <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
              <Ionicons name="mail-unread" size={30} color={colors.brand} />
            </View>
            <ScalableText className="text-2xl font-bold text-ink">
              {t("auth.resetSentTitle")}
            </ScalableText>
            <ScalableText className="mt-2 text-center text-base leading-6 text-ink-muted">
              {t("auth.resetSentBody", { email })}
            </ScalableText>
          </View>

          <View className="mt-8 gap-2.5">
            <Button label={t("auth.backToSignIn")} onPress={() => router.back()} />
            <Button
              label={t("auth.resetResend")}
              variant="ghost"
              onPress={() => setSent(false)}
            />
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
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-7 items-center">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-ink">
              <Ionicons name="key" size={26} color={colors.white} />
            </View>
            <ScalableText className="text-2xl font-bold text-ink">
              {t("auth.forgotTitle")}
            </ScalableText>
            <ScalableText className="mt-1 text-center text-base leading-6 text-ink-muted">
              {t("auth.forgotSubtitle")}
            </ScalableText>
          </View>

          {!isSupabaseConfigured && (
            <View className="mb-4 flex-row items-center gap-2 rounded-xl bg-surface-sunken px-3 py-2.5">
              <Ionicons name="information-circle" size={18} color={colors.inkMuted} />
              <ScalableText className="flex-1 text-xs text-ink-muted">
                {t("auth.previewNotice")}
              </ScalableText>
            </View>
          )}

          <View className="gap-4">
            <View className="gap-1.5">
              <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
                {t("auth.emailLabel")}
              </ScalableText>
              <TextInput
                className={INPUT}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                editable={!busy}
                returnKeyType="send"
                onSubmitEditing={() => void send()}
              />
            </View>

            {error && (
              <View className="flex-row items-start gap-2 rounded-xl bg-[#FBEAE7] px-3 py-2.5">
                <Ionicons name="alert-circle" size={18} color="#C0392B" />
                <ScalableText className="flex-1 text-sm text-[#C0392B]">{error}</ScalableText>
              </View>
            )}

            <Button
              label={t("auth.sendResetLink")}
              icon="mail-outline"
              onPress={() => void send()}
              loading={busy}
            />
            <Button
              label={t("common.cancel")}
              variant="ghost"
              onPress={() => router.back()}
              disabled={busy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
