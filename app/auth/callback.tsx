import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";

// Landing spot for auth deep links (the email confirmation link, the password recovery link; OAuth
// is completed inline in signInWithProvider).
//
// This screen deliberately does NOT read the URL. It used to, via its own "url" listener, and that
// was the bug: a screen cannot subscribe in time to hear the event that routed to it, so every
// reset link tapped while the app was running resolved to nothing and the user was bounced to
// sign-in. authStore.init() now owns every auth URL, cold and warm alike (see the comment there).
//
// So this is purely a status view over that work: spin while the store resolves the link, explain
// it if the link was expired or already used, and always offer a way out so nobody is trapped.
export default function AuthCallbackScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const resolving = useAuthStore((s) => s.linkResolving);
  const failed = useAuthStore((s) => s.linkFailed);
  const expired = useAuthStore((s) => s.linkExpired);

  const showFailure = failed && !resolving;

  return (
    <View className="flex-1 items-center justify-center bg-surface px-6">
      {!showFailure && <ActivityIndicator color={colors.brand} />}
      <ScalableText className="mt-4 text-center text-base text-ink-muted">
        {showFailure
          ? t(expired ? "auth.callbackExpired" : "auth.callbackFailed")
          : t("auth.callbackWorking")}
      </ScalableText>
      {showFailure && (
        <View className="mt-6 w-full max-w-sm">
          <Button
            label={t(expired ? "auth.requestNewLink" : "auth.backToSignIn")}
            onPress={() =>
              router.replace(expired ? "/auth/forgot-password" : "/auth/sign-in")
            }
          />
        </View>
      )}
    </View>
  );
}
