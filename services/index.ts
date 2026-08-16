// Service layer. Every service is an interface, so swapping a provider is one file and zero UI
// changes. The AI-backed ones (vision, NLP, pantry, recipe, swaps) now call real Supabase Edge
// Functions that hold the billable credential server-side; their on-device mocks are reachable ONLY
// when Supabase is unconfigured (Expo Go without env, web, tests). A mock is a demo stand-in, never
// a failure fallback: services that can fail return an outcome union so the UI reports the failure
// instead of showing numbers the device made up.
//
// Those unions now carry a reason rather than a bare "it broke". The AI functions sit behind a
// per-user daily cap (supabase/functions/_shared/aiQuota.ts) which refuses with 429, and "you have
// used today's allowance" is a different message, and a different user action, from "the service is
// down". See ./functionError.
export { classifyInvokeError, rateLimitDetail, type InvokeFailure } from "./functionError";
export {
  visionFoodService,
  type VisionFoodService,
  type VisionFoodOutcome,
} from "./visionFoodService";
export { nlpMealService, type NlpMealService, type NlpMealOutcome } from "./nlpMealService";
export { barcodeService, type BarcodeService } from "./barcodeService";
export { urlScrapeService, type UrlScrapeService } from "./urlScrapeService";
export {
  translationService,
  translateText,
  type TranslationService,
  type TranslationOutcome,
} from "./translationService";
export { substitutionService, type SubstitutionService } from "./substitutionService";
export { healthySwapService, type HealthySwapService } from "./healthySwapService";
export { cartExportService, type CartExportService } from "./cartExportService";
export { storageService, type StorageService, type StorageBucket } from "./storageService";
export { supabase, isSupabaseConfigured } from "./supabase";
