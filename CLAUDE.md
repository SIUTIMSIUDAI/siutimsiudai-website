# Siu Tim Siu Dai (少甜少底) — Hong Kong Meal Tracker + Recipe App

Cross-platform mobile app for the Hong Kong market: multi-modal nutrition logging, a smart recipe box, and pantry/grocery management. Bilingual English / Traditional Chinese throughout.

## Stack

- Expo SDK 54 + React Native 0.81 + React 19 + TypeScript, file-based routing via expo-router (`typedRoutes` on).
- NativeWind v4 (Tailwind) for styling. Theme tokens in `tailwind.config.js` and `constants/theme.ts`.
- Zustand + `persist` over AsyncStorage for global state and offline cache.
- Supabase (auth, Postgres, Storage, Edge Functions). Live, not a stub.
- RevenueCat via `react-native-purchases` for subscriptions.
- expo-camera (barcode + capture), expo-image-picker, expo-localization, expo-apple-authentication, expo-local-authentication (Face ID), expo-secure-store (keychain).
- i18next + react-i18next, resources in `i18n/`.

## Scripts

- `npm install`, then `npx expo start`.
- `npm test` runs Jest on pure logic (unit converter, grocery merge, cart export, store launcher, biometric gating).
- `npm run typecheck` runs `tsc --noEmit`.
- `eas build` profiles: `development`, `development-device`, `preview`, `production`.
- If install reports version drift, run `npx expo install --fix`.

## Runtime rules

- Requires Node 18+.
- **This app no longer runs in stock Expo Go.** `react-native-purchases`, `expo-apple-authentication`, and `expo-local-authentication` are native modules, so day-to-day work needs an `expo-dev-client` build (`eas build --profile development`).
- Services in `services/` are interfaces, so swapping a provider is one file and zero UI change.
- The AI features (meal photo, NLP text, pantry scan, recipe generation, healthy swaps, translation) call **real Supabase Edge Functions** that hold the Google Cloud credential server-side. See `supabase/functions/`.
- The live Supabase project sits in `ap-south-1` (Mumbai), which was never a deliberate choice. **Any new Supabase project for this app must be created in `ap-southeast-1` (Singapore).** It is the closest region to Hong Kong that Supabase offers, so it cuts a round trip on every query and every Edge Function call for the entire user base. A project's region cannot be changed after creation, so this only gets fixed when infrastructure is next rebuilt.
- **A mock is a demo stand-in, never a failure fallback.** On-device mocks are reachable only when Supabase is unconfigured (Expo Go without env, web preview, tests). Services that can fail return an outcome union so the UI reports the failure instead of showing numbers the device invented.

## Security

- Only PUBLISHABLE keys ship in the client: RevenueCat `appl_` (iOS) and `goog_` (Android), Supabase anon / `sb_publishable_`.
- Never put a billable secret in the bundle or in a committed file. Google Cloud service account, RevenueCat `sk_`, Supabase `service_role`, any AI provider key: server-side only, set via `supabase secrets set`.
- No secret may be `EXPO_PUBLIC_`. Never echo a secret value into a terminal or a file.
- Gitignored and never committed: `.env`, `env.local.txt`, `siutimsiutai-camera-ai-*.json`.
- **Key material lives in `~/AppStoreKeys/`, never in the repo.** This repo sits under `~/Documents`, and this Mac has Desktop & Documents sync to iCloud enabled, so anything left in the working tree is copied to iCloud Drive whether or not git ignores it. `.gitignore` protects the repository, not the disk. Currently held there, all `chmod 600`: the GCP service account JSON, `env.local.txt` (`GOOGLE_TRANSLATE_API_KEY`), the two App Store Connect `AuthKey_*.p8` files and the subscription key. `.env` is the one deliberate exception, because Expo and `supabase config push` both read it from the project root.
- **Supabase's `verify_jwt` is not an authorisation check.** It accepts the anon key, which is inlined into the app bundle and readable by anyone who unzips the APK. Every Edge Function that spends money or touches user data must additionally call `requireUser()` from `supabase/functions/_shared/requireUser.ts`, which resolves the bearer token to a real auth user. Without it, the AI endpoints were an uncapped Google Cloud bill for anyone who could run `unzip`.
- No `[functions.*]` block in `supabase/config.toml` may set `verify_jwt = false` without a written reason. That flag makes an endpoint reachable by the whole internet with no token at all.
- `android.allowBackup` is `false` on purpose. AsyncStorage holds the Supabase refresh token (`services/supabase.ts`) and the full food diary, and Android auto-backup would copy both to the user's Google Drive, which no policy discloses. Server sync is the backup path; the app requires sign-in, so nothing is local-only.

## Conventions

- All entity shapes are explicit `interface`s in `types/`. Prefer interfaces over type unions.
- Bilingual data is paired camelCase fields: `name` + `nameZh`, `title` + `titleZh`, `reason` + `reasonZh`. Render with `tl(en, zh)` from `useLocale`, which picks per `useAppStore.locale`. Reusable UI strings go in `i18n/` and use `t("key")`; copy that belongs with its data stays inline with `tl()`.
- British spelling in code, comments, and docs.
- No em dashes in app copy. Playful HK Cantonese everywhere EXCEPT auth, verification, and system-error copy, which stays clean and trustworthy.
- Hong Kong wet-market math is fixed in `utils/unitConverter.ts`: 1 catty (斤) = 604.79g, 1 tael (兩) = 37.8g, 16 taels = 1 catty. Never use Mainland rounded values (500g jin / 50g liang).
- Grocery merging is bilingual-aware via `utils/groceryMerge.ts` and the EN/zh-Hant dictionary in `constants/ingredientDictionary.ts`.
- Retailer links use universal links, not custom URL schemes. `appSearchTemplate` is deliberately unset for all three retailers; see the reasoning in `constants/retailers.ts` and `utils/storeLauncher.ts`.
- Any surface that states a health figure must carry `<SourcesLink />` and its source must be in `constants/citations.ts` (App Store Guideline 1.4.1; version 1.0 (13) was rejected for citing nothing). Re-verify every citation URL before each submission and update the date in that file's header.
- The RevenueCat key is per-store and picked by `utils/billingKey.ts`. A key is only valid if its prefix matches the platform it is handed to; anything else falls into mock mode on purpose. Never collapse the two keys back into one, an Apple key on Android leaves a permanently dead paywall with no visible error.
- Accessibility: respect OS dynamic text size (`fontScale`), keep touch targets >= 44pt, pair prominent icons with labels.
- Progressive disclosure: the calorie ring is the hero; macros and advanced options hide behind drawers/toggles.

## Layout

`app/` routes, `screens/` composed bodies, `components/` UI, `hooks/` shared hooks, `services/` service layer, `stores/` Zustand, `supabase/functions/` Edge Functions, `database/` SQL, `types/` interfaces, `i18n/` locales, `utils/` pure logic, `constants/` tokens and data, `privacy/` + `terms/` legal copy, `siutimsiudai-website/` marketing site.
