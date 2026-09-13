// Sentry bootstrap. Errors & crashes only — no tracing, no replay, no screenshots. Follows the
// codebase's "unconfigured ⇒ mock/no-op" convention: without a DSN, or in dev/Expo Go/web/Jest,
// initSentry() does nothing, so the app behaves exactly as before. Real reports come only from a
// released build with EXPO_PUBLIC_SENTRY_DSN set.
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import { scrubBreadcrumb, scrubEvent } from "./sentryScrub";

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || __DEV__) return;
  Sentry.init({
    dsn,
    environment: Updates.channel ?? "production",
    tracesSampleRate: 0, // errors only
    sendDefaultPii: false, // no IP, no default user identity
    attachStacktrace: true,
    attachScreenshot: false, // never capture the screen (diary content)
    attachViewHierarchy: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
