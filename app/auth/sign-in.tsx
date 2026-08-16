import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { AppleAuthButton, GoogleAuthButton } from "@/components/SocialAuthButtons";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useBiometricLogin } from "@/hooks/useBiometricLogin";
import { useAuthStore } from "@/stores/authStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { isSupabaseConfigured } from "@/services/supabase";
import * as biometricAuth from "@/services/biometricAuth";
import { signInSchema, signUpSchema, type SignUpValues } from "@/utils/passwordSchema";
import { biometricNameKey, shouldClearCredential } from "@/utils/biometricLogin";
import { authErrorKey, fieldErrorKey } from "@/utils/authErrorCopy";
import {
  OAuthProvider,
  appleSignInAvailable,
  signInWithApple,
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
} from "@/services/authService";

type Mode = "signIn" | "signUp";
type Busy = null | "email" | "biometric" | OAuthProvider;

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3.5 py-3 text-base text-ink";

// The authentication screen. Intentionally plain and professional: no brand humour here, standard
// email/password plus the official Apple and Google buttons. Email signups are handed to the
// verification wall via authStore.pendingEmail; the route gate does the actual navigation.
//
// Validation runs through React Hook Form + zod (utils/passwordSchema). Sign-UP enforces the strong
// rules (>= 8 chars, upper, lower, number, symbol) and shows a live checklist; sign-IN validates
// shape only, so an existing account created before the rule is never locked out at the door.
export default function SignInScreen() {
  const { t } = useLocale();
  const setPending = useAuthStore((s) => s.setPending);
  const resetTierForNewAccount = useSubscriptionStore((s) => s.resetTierForNewAccount);

  const [mode, setMode] = useState<Mode>("signIn");
  const [busy, setBusy] = useState<Busy>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const biometric = useBiometricLogin();

  // Sign in with Apple is shown only where the native sheet can actually be presented, which in
  // practice means iOS. Build 12 was rejected under guideline 2.1(a) because this button was
  // always rendered and always failed; an absent button is honest, a broken one is a bug. Async
  // because isAvailableAsync is, so it starts false and appears once iOS confirms.
  const [showApple, setShowApple] = useState(false);
  useEffect(() => {
    let active = true;
    void appleSignInAvailable().then((ok) => {
      if (active) setShowApple(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const isSignUp = mode === "signUp";
  const anyBusy = busy !== null;

  // Sign-in tab only. On the sign-up tab there is no account to unlock, and a Face ID button beside
  // "Create account" reads as though it will make one.
  const offerBiometric = !isSignUp && biometric.ready && biometric.canSignIn;
  const biometricName = t(biometricNameKey(biometric.capability.kind));

  async function biometricSignIn() {
    setServerError(null);
    setBusy("biometric");
    const res = await biometricAuth.signIn(t("auth.biometricPrompt"));
    setBusy(null);
    if (res.ok) return; // A session now exists and the route gate advances on its own.

    const failure = res.failure ?? "unknown";
    // Dismissing the sheet is a decision, not a fault. Saying anything here would be telling the
    // user off for something they meant to do.
    if (failure === "cancelled") return;
    setServerError(t(`auth.biometricErr.${failure}`, { method: biometricName }));
    // A rejected token has already been deleted by the service. Re-read so the button disappears
    // instead of sitting there promising something it can no longer deliver.
    if (shouldClearCredential(failure)) await biometric.reload();
  }

  // The active schema depends on mode. A ref keeps the resolver identity stable across renders while
  // still reading the latest mode at validation time, so we never rebuild the form on every toggle.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const resolver = useCallback<Resolver<SignUpValues>>(
    (values, context, options) =>
      zodResolver(modeRef.current === "signUp" ? signUpSchema : signInSchema)(values, context, options),
    [],
  );

  const {
    control,
    handleSubmit,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<SignUpValues>({
    defaultValues: { email: "", password: "" },
    resolver,
    mode: "onTouched",
  });

  const localizedFieldError = (name: keyof SignUpValues): string | null => {
    const key = fieldErrorKey(errors[name]?.message);
    return key ? t(key) : null;
  };

  async function onValid(values: SignUpValues) {
    setServerError(null);
    setBusy("email");
    const email = values.email.trim();
    const res = isSignUp
      ? await signUpWithEmail(email, values.password)
      : await signInWithEmail(email, values.password);
    setBusy(null);

    if (!res.ok) {
      setServerError(t(authErrorKey(res.error)));
      return;
    }

    if (isSignUp) {
      // A newly created account always starts on the Free plan. Reset the local tier mirror right
      // now so a shared device (or a leftover simulated-checkout purchase) can't show the new user
      // a paid plan. If they genuinely own an entitlement, RevenueCat restores it on the next sync.
      resetTierForNewAccount();
      if (res.needsVerification) {
        // Keep the credentials so the verify screen can retry sign-in after the user confirms.
        setPending(email, values.password);
        return;
      }
    }
    // Otherwise a session now exists and the route gate advances on its own.
  }

  async function oauth(provider: OAuthProvider) {
    setServerError(null);
    setBusy(provider);
    // Apple goes through the native system sheet, not the browser. Everything else is browser
    // OAuth. Keeping the branch here rather than inside signInWithProvider means the Google path
    // is untouched by the Apple fix.
    const res = provider === "apple" ? await signInWithApple() : await signInWithProvider(provider);
    setBusy(null);
    // A user-cancelled sheet is not an error worth showing.
    if (!res.ok && res.error !== "cancelled") setServerError(t(authErrorKey(res.error)));
  }

  function switchMode() {
    setMode(isSignUp ? "signIn" : "signUp");
    setServerError(null);
    // Drop any field errors so a strong-rule failure from sign-up doesn't linger into sign-in.
    clearErrors();
  }

  const emailError = localizedFieldError("email");
  const passwordError = localizedFieldError("password");

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-8 items-center">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-ink">
              <Ionicons name="fast-food" size={28} color={colors.white} />
            </View>
            <ScalableText className="text-2xl font-bold text-ink">{t("auth.title")}</ScalableText>
            <ScalableText className="mt-1 text-center text-base text-ink-muted">
              {isSignUp ? t("auth.subtitleSignUp") : t("auth.subtitleSignIn")}
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

          {/* The registered account gets the top slot: someone who set this up came here to use it,
              and burying it under the social buttons would make them scroll past their own shortcut.
              The email is shown because on a shared device it is the only way to tell whose account
              the button is about to open. */}
          {offerBiometric && (
            <View className="mb-3 gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={biometric.capability.kind === "face" ? "scan-outline" : "finger-print-outline"}
                  size={18}
                  color={colors.brand}
                />
                <ScalableText className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                  {biometric.credential?.email ?? t("auth.biometricRegistered")}
                </ScalableText>
              </View>
              <Button
                label={t("auth.biometricSignIn", { method: biometricName })}
                onPress={() => {
                  void biometricSignIn();
                }}
                loading={busy === "biometric"}
                disabled={anyBusy && busy !== "biometric"}
              />
            </View>
          )}

          <View className="gap-3">
            {showApple && (
              <AppleAuthButton
                label={t("auth.continueApple")}
                loading={busy === "apple"}
                disabled={anyBusy && busy !== "apple"}
                onPress={() => oauth("apple")}
              />
            )}
            <GoogleAuthButton
              label={t("auth.continueGoogle")}
              loading={busy === "google"}
              disabled={anyBusy && busy !== "google"}
              onPress={() => oauth("google")}
            />
          </View>

          <View className="my-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-[#E4DCCB]" />
            <ScalableText className="text-xs font-medium uppercase text-ink-faint">
              {t("auth.or")}
            </ScalableText>
            <View className="h-px flex-1 bg-[#E4DCCB]" />
          </View>

          <View className="gap-4">
            <View className="gap-1.5">
              <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
                {t("auth.emailLabel")}
              </ScalableText>
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    className={INPUT}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder={t("auth.emailPlaceholder")}
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    editable={!anyBusy}
                  />
                )}
              />
              {emailError && (
                <ScalableText className="px-1 text-xs text-[#C0392B]">{emailError}</ScalableText>
              )}
            </View>

            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <PasswordField
                  label={t("auth.passwordLabel")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("auth.passwordPlaceholder")}
                  error={passwordError}
                  // The strength checklist belongs to sign-UP only. On sign-in it would read as an
                  // accusation about a password the user already has and cannot change from here.
                  showRules={isSignUp}
                  autoComplete={isSignUp ? "new" : "current"}
                  editable={!anyBusy}
                />
              )}
            />

            {/* Sign-in only. On the sign-up tab there is no account to recover yet, and offering it
                there just invites people to reset a password they have not created. */}
            {!isSignUp && (
              <Pressable
                accessibilityRole="button"
                disabled={anyBusy}
                onPress={() => {
                  // Carry whatever they have typed across, so the reset screen does not ask for an
                  // address they just entered.
                  const typed = (getValues("email") ?? "").trim();
                  router.push(
                    typed ? `/auth/forgot-password?email=${encodeURIComponent(typed)}` : "/auth/forgot-password",
                  );
                }}
                className="-mt-1 min-h-[44px] justify-center self-start px-1"
              >
                <ScalableText className="text-sm font-semibold text-brand">
                  {t("auth.forgotPassword")}
                </ScalableText>
              </Pressable>
            )}

            {serverError && (
              <View className="flex-row items-start gap-2 rounded-xl bg-[#FBEAE7] px-3 py-2.5">
                <Ionicons name="alert-circle" size={18} color="#C0392B" />
                <ScalableText className="flex-1 text-sm text-[#C0392B]">{serverError}</ScalableText>
              </View>
            )}

            <Button
              label={isSignUp ? t("auth.createAccount") : t("auth.signIn")}
              onPress={handleSubmit(onValid)}
              loading={busy === "email"}
              disabled={anyBusy && busy !== "email"}
            />
          </View>

          <View className="mt-6 flex-row items-center justify-center gap-1">
            <ScalableText className="text-sm text-ink-muted">
              {isSignUp ? t("auth.haveAccount") : t("auth.noAccount")}
            </ScalableText>
            <Pressable
              accessibilityRole="button"
              onPress={switchMode}
              className="min-h-[44px] justify-center"
              disabled={anyBusy}
            >
              <ScalableText className="text-sm font-bold text-brand">
                {isSignUp ? t("auth.switchToSignIn") : t("auth.switchToSignUp")}
              </ScalableText>
            </Pressable>
          </View>

          <ScalableText className="mt-4 px-4 text-center text-xs leading-5 text-ink-faint">
            {t("auth.legal")}
          </ScalableText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
