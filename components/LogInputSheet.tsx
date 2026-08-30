import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { MealTypePicker } from "./MealTypePicker";
import { PaywallModal } from "./PaywallModal";
import { SourcesLink } from "./SourcesLink";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatCalories } from "@/utils/formatters";
import { parseMealText } from "@/utils/parseMeal";
import { useNutritionStore } from "@/stores/nutritionStore";
import { useSavedMealsStore } from "@/stores/savedMealsStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { barcodeService, nlpMealService, visionFoodService } from "@/services";
import type { InvokeFailure } from "@/services/functionError";
import { HK_DISHES } from "@/constants/hkDishes";
import { tapLight } from "@/utils/haptics";
import { createScanLatch } from "@/utils/scanLatch";
import { EntryMicronutrients, LogSource, MealType } from "@/types";

interface Props {
  visible: boolean;
  date: string;
  onClose: () => void;
}

// No "label" tab. LogSource still carries "label" for entries logged by older builds, but there is
// no label reader to capture a new one with — see the note on the barcode miss below.
type Tab = "photo" | "voice" | "barcode" | "manual";

// Canonical code-switched demo string the simulated mic injects (no native speech-to-text
// in Expo Go, so the mic is a mocked trigger per the hands-free design).
const VOICE_EXAMPLE = "朝早食咗一碗麥片加 mixed berries";

// A normalised guess from any of the five inputs. The shared candidate list renders these
// the same way, and "Add to log" / "Edit" behave identically regardless of source.
interface Candidate {
  name: string;
  nameZh: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: LogSource;
  confidence?: number;
  portionLabel?: string;
  portionLabelZh?: string;
  barcode?: string | null;
  unit?: string;
  // Premium per-serving vitamins & minerals from the photo / voice AI. Carried to addEntry, where
  // the save path keeps it for paid tiers and drops it for free (retainMicrosForTier).
  micros?: EntryMicronutrients | null;
}

// The resolved nutrition for a manual entry once a dish is known — from a quick-tag, a corrected
// candidate, or a local keyword match. When absent, the entry's text is sent to the logging AI.
interface ManualNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  micros: EntryMicronutrients | null;
}

const TABS: { key: Tab; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = [
  { key: "photo", icon: "camera-outline", labelKey: "log.photo" },
  { key: "voice", icon: "mic-outline", labelKey: "log.voice" },
  { key: "barcode", icon: "barcode-outline", labelKey: "log.barcode" },
  { key: "manual", icon: "create-outline", labelKey: "log.manual" },
];

// Barcodes you can tap when there is no camera to hand (simulator, or just trying the feature).
// They are labelled by what the food IS, not by who makes it: the brand shown after the lookup
// comes from Open Food Facts, so it is that database's attribution rather than ours. These used
// to be brand-name chips wired to a hardcoded catalogue we had made the numbers up for.
//
// The three cover the three outcomes worth seeing: nutrition stated per serving, nutrition stated
// per 100 g, and a barcode nobody has catalogued, which is the honest miss.
const SAMPLE_CODES = [
  { code: "4891028717614", label: "Soy milk", labelZh: "豆奶" },
  { code: "4892294418038", label: "Crisps", labelZh: "薯片" },
  { code: "4899999999995", label: "Not in database", labelZh: "查唔到" },
];

// Retail product symbologies only. CameraView will happily decode a QR code or a boarding pass if
// you let it, and every one of those would be handed to a food database that cannot answer for it.
// EAN-13 covers Hong Kong retail (the 489 prefix); the rest cover imports and small packages.
const BARCODE_FORMATS = ["ean13", "ean8", "upc_a", "upc_e"] as const;

const INPUT =
  "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

// Copy a freshly captured asset into the app cache under a stable, timestamped name so the
// photo has a predictable home the vision pipeline (and a future upload) can reuse. The picker
// already writes to cache, so this is best-effort: any failure, or web where cacheDirectory is
// null, falls back to the original cached URI rather than blocking the log.
async function cacheMealPhoto(uri: string): Promise<string> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return uri;
    const dest = `${dir}meal-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

// The outcome of asking for a meal image. A bare null could not tell a cancel (the user backed
// out, so say nothing) from a refusal (camera permission off, so say how to fix it) from a native
// fault, so the button just died silently. This union lets runPhoto react to each: the app's rule
// is to report a failure, never swallow it.
type PhotoResult =
  | { status: "ok"; uri: string; base64: string }
  | { status: "cancel" }
  | { status: "denied" } // camera permission refused; only the camera path can raise this
  | { status: "error" }; // the picker threw, e.g. restricted photo access or a native fault

// Resolve a meal image for the chosen source. "camera" asks for permission and opens the
// viewfinder; a refusal returns "denied" (not a silent fall-through to the library) so the UI can
// point the user at Settings and the upload button. "library" (and web, which has no in-preview
// camera) opens the photo library, which needs no permission on iOS. Never throws.
//
// quality 0.5 (was 0.7) and base64: the bytes now actually travel to the vision model, so the
// payload size is real. Gemini needs enough detail to name a dish, not to read fine print.
async function getMealPhoto(source: "camera" | "library"): Promise<PhotoResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.5,
    base64: true,
  };
  try {
    let result: ImagePicker.ImagePickerResult;
    if (source === "library" || Platform.OS === "web") {
      result = await ImagePicker.launchImageLibraryAsync(options);
    } else {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { status: "denied" };
      result = await ImagePicker.launchCameraAsync(options);
    }
    if (result.canceled || !result.assets?.length) return { status: "cancel" };
    const asset = result.assets[0];
    if (!asset.base64) return { status: "cancel" }; // nothing to send; a cancel, not a failure
    return { status: "ok", uri: await cacheMealPhoto(asset.uri), base64: asset.base64 };
  } catch {
    return { status: "error" };
  }
}

// Resolve a free-text description to a known dish's nutrition via the local keyword matcher (the
// same one the voice tab runs through nlpMealService). Returns null when nothing matches, which
// routes the manual entry to the logging AI for an estimate instead.
function matchKnownDish(text: string): ManualNutrition | null {
  const [first] = parseMealText(text);
  if (!first) return null;
  return {
    calories: first.calories,
    protein: first.protein,
    carbs: first.carbs,
    fat: first.fat,
    fiber: first.fiber,
    micros: first.micros ?? null,
  };
}

// Parse the optional manual quantity into a positive serving multiplier. Blank or junk means one
// serving; capped so a stray big number can't blow up the day's totals.
function parseQty(raw: string): number {
  const n = parseFloat(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, 99);
}

// Scale a micronutrient set by the serving multiplier, keeping only the keys that were present.
function scaleMicros(m: EntryMicronutrients | null, factor: number): EntryMicronutrients | null {
  if (!m || factor === 1) return m;
  const out: EntryMicronutrients = {};
  (Object.keys(m) as (keyof EntryMicronutrients)[]).forEach((k) => {
    const v = m[k];
    if (typeof v === "number") out[k] = v * factor;
  });
  return out;
}

export function LogInputSheet({ visible, date, onClose }: Props) {
  const { t, tl } = useLocale();
  const addEntry = useNutritionStore((s) => s.addEntry);
  const savedMeals = useSavedMealsStore((s) => s.meals);
  const markUsed = useSavedMealsStore((s) => s.markUsed);
  const incrementAiLog = useSubscriptionStore((s) => s.incrementAiLog);
  const aiAccess = useFeatureAccess("ai_log");

  const [tab, setTab] = useState<Tab>("photo");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [barcodeMiss, setBarcodeMiss] = useState(false);
  // True when an AI call was attempted against a configured backend and it failed. Distinct from a
  // "miss" (the AI answered, but with nothing): this one means we could not ask at all, and the
  // honest move is to say so rather than show numbers we made up on the device.
  // Why the AI could not answer, not merely that it could not. "rate_limited" is the daily
  // per-user cap and needs its own message: retrying now cannot help, so the generic
  // "check your connection and try again" would be actively misleading.
  const [aiError, setAiError] = useState<InvokeFailure | null>(null);
  // The opposite case: the AI answered, and the answer was "nothing here". Newly reachable on the
  // photo and voice tabs now that a failed/empty estimate no longer falls through to an on-device
  // guess. A photo of a cat SHOULD come back empty, and the user needs to be told that plainly.
  const [aiMiss, setAiMiss] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  // Why a tapped Photo action produced no image: "denied" (camera permission off) or "error" (the
  // picker threw). null means nothing to report. Surfacing this is the fix for the dead "Snap"
  // button: a refused camera used to resolve to null and say nothing at all.
  const [photoBlock, setPhotoBlock] = useState<null | "denied" | "error">(null);
  // A recognition batch is one AI call, so it costs one AI log however many of its order-slip lines
  // the user keeps. It flips true on the first non-manual line committed, so the rest (or an "add
  // all") do not charge again. Reset whenever a new batch is produced.
  const [batchCharged, setBatchCharged] = useState(false);

  const [text, setText] = useState("");
  const [code, setCode] = useState("");

  // Live camera barcode scanning. The typed field below stays the whole feature's fallback: it is
  // the only way in on a simulator, when camera permission is refused, and when a packet is too
  // creased or too shiny to read.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // True once the user has been asked and said no, so we can explain rather than silently do
  // nothing. Distinct from "not yet asked", which should just prompt.
  const [cameraDenied, setCameraDenied] = useState(false);
  // onBarcodeScanned fires continuously while the code is in frame, many times a second. The latch
  // reduces that to one lookup per opening of the scanner. A ref, not state, because the callback
  // must observe the change on its very next frame, not after a re-render.
  const scanLatch = useRef(createScanLatch());

  const [mName, setMName] = useState("");
  const [mNameZh, setMNameZh] = useState("");
  // Optional serving multiplier for the manual entry. Blank means one serving; when set it scales
  // the resolved macros + micros (a known dish or an AI estimate) before they hit the ledger.
  const [mQty, setMQty] = useState("");
  // Known-dish nutrition for the current manual entry: set by a quick-tag pick or by loading a
  // candidate to correct. Cleared when the user types a name (they're going off-menu, which routes
  // the entry to the logging AI on add). null means "estimate from the text".
  const [manualPreset, setManualPreset] = useState<ManualNutrition | null>(null);
  // True after the AI returned no estimate for a novel description, so we can nudge inline.
  const [manualMiss, setManualMiss] = useState(false);

  function resetManual() {
    setMName("");
    setMNameZh("");
    setMQty("");
    setManualPreset(null);
    setManualMiss(false);
  }

  function closeScanner() {
    setScannerOpen(false);
    scanLatch.current.rearm();
  }

  function close() {
    setCandidates([]);
    setBarcodeMiss(false);
    setAiError(null);
    setAiMiss(false);
    setPhotoBlock(null);
    setBatchCharged(false);
    setText("");
    setCode("");
    setLoading(false);
    closeScanner();
    resetManual();
    onClose();
  }

  function switchTab(next: Tab) {
    setTab(next);
    setCandidates([]);
    setBarcodeMiss(false);
    setManualMiss(false);
    setAiError(null);
    setAiMiss(false);
    setPhotoBlock(null);
    setBatchCharged(false);
    // Leaving the barcode tab with the camera still live would keep it running behind another tab.
    closeScanner();
  }

  // Free tier gets a metered number of AI-assisted logs a week (photo/voice/barcode/label).
  // Once the weekly allotment is spent, pop the contextual paywall over the sheet instead of
  // firing another recognition. The sheet stays put so manual entry is still one tap away.
  // Returns false when blocked so callers bail early. Manual never gates.
  function guardAiLog(): boolean {
    if (aiAccess.hasAccess) return true;
    setPaywallVisible(true);
    return false;
  }

  async function runPhoto(source: "camera" | "library") {
    if (!guardAiLog()) return;
    // Clear any prior capture message, then open the picker before the spinner or the quota spend,
    // so a cancelled or refused capture costs the user nothing.
    setPhotoBlock(null);
    const photo = await getMealPhoto(source);
    if (photo.status === "denied") {
      // Camera switched off for the app: point at Settings and the upload button instead of
      // leaving a dead button. This silent path was the "nothing happens" report.
      setPhotoBlock("denied");
      return;
    }
    if (photo.status === "error") {
      setPhotoBlock("error");
      return;
    }
    if (photo.status !== "ok") return; // a plain cancel: the user backed out, so say nothing
    setLoading(true);
    setAiError(null);
    setAiMiss(false);
    setBatchCharged(false); // a fresh recognition is a new AI call, chargeable again
    const outcome = await visionFoodService.recognize(photo.base64);
    if (!outcome.ok) {
      // The recogniser is configured but could not answer. Say so rather than showing a guess:
      // these numbers go into the calorie ring, so a fabricated dish is worse than no dish.
      setCandidates([]);
      setAiError(outcome.error);
      setLoading(false);
      return;
    }
    // An empty list is a real answer here, and one the photo prompt deliberately asks for when the
    // frame holds no food. Surfacing it is the point: the old code could not produce this state.
    setAiMiss(outcome.results.length === 0);
    setCandidates(
      outcome.results.map((r) => ({
        name: r.name,
        nameZh: r.nameZh,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        fiber: r.fiber,
        source: "photo",
        confidence: r.confidence,
        portionLabel: r.portionLabel,
        portionLabelZh: r.portionLabelZh,
        micros: r.micros,
      })),
    );
    setLoading(false);
  }

  async function runVoice() {
    if (!text.trim()) return;
    if (!guardAiLog()) return;
    setLoading(true);
    setAiError(null);
    setAiMiss(false);
    setBatchCharged(false); // a fresh recognition is a new AI call, chargeable again
    const outcome = await nlpMealService.parse(text);
    if (!outcome.ok) {
      setCandidates([]);
      setAiError(outcome.error);
      setLoading(false);
      return;
    }
    setAiMiss(outcome.meals.length === 0);
    setCandidates(
      outcome.meals.map((p) => ({
        name: p.name,
        nameZh: p.nameZh,
        calories: p.calories,
        protein: p.protein,
        carbs: p.carbs,
        fat: p.fat,
        fiber: p.fiber,
        source: "voice",
        unit: p.unit,
        micros: p.micros,
      })),
    );
    setLoading(false);
  }

  // Ask for the camera and open the live scanner. The quota is checked here rather than after the
  // scan so a user out of AI logs meets the paywall instead of a camera that turns out to be a dead
  // end, and so the paywall never has to stack on top of a live preview.
  async function openScanner() {
    if (!guardAiLog()) return;
    // The typed field sits right below the button, so the keyboard is often up when this is
    // tapped. It would otherwise sit over the camera preview.
    Keyboard.dismiss();
    setBarcodeMiss(false);
    setCameraDenied(false);
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        // Refused. The typed field is still right there, so say that rather than nothing.
        setCameraDenied(true);
        return;
      }
    }
    scanLatch.current.rearm();
    setScannerOpen(true);
  }

  // One barcode, one lookup. The latch closes on the first frame that decodes and only reopens when
  // the scanner is opened again.
  function handleScanned(value: string) {
    if (!scanLatch.current.accept()) return;
    tapLight();
    setScannerOpen(false);
    setCode(value);
    void runBarcode(value);
  }

  async function runBarcode(value: string) {
    const c = value.trim();
    if (!c) return;
    if (!guardAiLog()) return;
    setLoading(true);
    setBarcodeMiss(false);
    setBatchCharged(false); // a fresh lookup is a new chargeable action
    const product = await barcodeService.lookup(c);
    if (!product) {
      setCandidates([]);
      setBarcodeMiss(true);
    } else {
      setCandidates([
        {
          name: product.name,
          nameZh: product.nameZh,
          calories: product.calories,
          protein: product.protein,
          carbs: product.carbs,
          fat: product.fat,
          fiber: product.fiber,
          source: "barcode",
          barcode: product.barcode,
          unit: product.servingSize,
        },
      ]);
    }
    setLoading(false);
  }

  // Write one order-slip line to the diary and keep the saved-meal quick-add ordered by real use.
  // Shared by the single-line "Add meal" and the "Add all" batch commit.
  function saveCandidate(c: Candidate) {
    addEntry(
      {
        name: c.name,
        nameZh: c.nameZh,
        calories: c.calories,
        protein: c.protein,
        carbs: c.carbs,
        fat: c.fat,
        fiber: c.fiber,
        mealType,
        source: c.source,
        unit: c.unit,
        barcode: c.barcode ?? null,
        micros: c.micros ?? null,
      },
      date,
    );
    // Bump an existing saved meal so the quick-add row stays ordered by real use.
    const saved = savedMeals.find((m) => m.name === c.name);
    if (saved) markUsed(saved.id);
  }

  // A recognition batch is one AI call, so it costs one AI log however many lines the user keeps.
  // Charge on the first non-manual line committed; the flag (reset per new batch) stops the rest,
  // or an "add all", from charging again. Manual lines meter in addManual, never here.
  function meterBatchOnce(source: LogSource) {
    if (source === "manual" || batchCharged) return;
    incrementAiLog();
    setBatchCharged(true);
  }

  // Log a single order-slip line WITHOUT dismissing the sheet, so the other lines from the same
  // recognition stay addable. When the last line is gone the sheet closes, which keeps single-item
  // barcode / one-dish photo behaving exactly as before.
  function commit(c: Candidate) {
    tapLight();
    saveCandidate(c);
    meterBatchOnce(c.source);
    const remaining = candidates.filter((x) => x !== c);
    if (remaining.length === 0) {
      close();
      return;
    }
    setCandidates(remaining);
  }

  // Log every remaining order-slip line in one tap: the primary action when a voice order or a photo
  // returns several dishes. The whole batch is one AI call, so it spends exactly one AI log (unless
  // an earlier single-line add already charged it).
  function commitAll() {
    if (candidates.length === 0) return;
    tapLight();
    candidates.forEach(saveCandidate);
    if (!batchCharged && candidates.some((c) => c.source !== "manual")) incrementAiLog();
    close();
  }

  // Commit a resolved manual nutrition, scaled by the optional serving quantity, as a manual entry.
  function commitManual(name: string, nameZh: string, n: ManualNutrition, qty: number) {
    commit({
      name,
      nameZh,
      calories: n.calories * qty,
      protein: n.protein * qty,
      carbs: n.carbs * qty,
      fat: n.fat * qty,
      fiber: n.fiber * qty,
      micros: scaleMicros(n.micros, qty),
      source: "manual",
    });
  }

  // Smart manual log: the user only says WHAT they ate (and optionally how many servings). Known
  // dishes (a quick-tag, a corrected candidate, or a local keyword match) fill instantly and free.
  // A novel description is handed to the logging AI to estimate all macros + micros — that path is
  // metered like the other AI tabs. Either way the result is scaled by the quantity before saving.
  async function addManual() {
    const en = mName.trim();
    const zh = mNameZh.trim();
    if (!en && !zh) return;
    setManualMiss(false);

    const name = en || zh;
    const nameZh = zh || en;
    const qty = parseQty(mQty);

    // 1) Known dish: fills instantly, never spends an AI log.
    const known = manualPreset ?? matchKnownDish(`${en} ${zh}`);
    if (known) {
      commitManual(name, nameZh, known, qty);
      return;
    }

    // 2) Novel description: estimate via the logging AI. Metered, so gate on the weekly quota
    //    first (this pops the paywall when a free user's logs are spent).
    if (!guardAiLog()) return;
    setLoading(true);
    setAiError(null);
    const outcome = await nlpMealService.parse(`${en} ${zh}`.trim());
    setLoading(false);
    if (!outcome.ok) {
      // Backend down: distinct from "the AI looked and had no idea", and it must not silently
      // commit a locally-invented estimate into the ledger.
      setAiError(outcome.error);
      return;
    }
    const best = outcome.meals[0];
    if (!best) {
      // No estimate came back, and a miss spends nothing. Nudge a tag or a rename inline.
      setManualMiss(true);
      return;
    }
    // A successful estimate spends one AI log. Metered here (not via commit) so the entry still
    // records as a manual log — commit only auto-meters non-manual sources.
    incrementAiLog();
    commitManual(
      name,
      nameZh,
      {
        calories: best.calories,
        protein: best.protein,
        carbs: best.carbs,
        fat: best.fat,
        fiber: best.fiber,
        micros: best.micros ?? null,
      },
      qty,
    );
  }

  // The accuracy guardrail: load any guess into the manual form to correct its name. Its estimate
  // rides along as the preset, so confirming as-is keeps the numbers; retyping the name re-routes
  // the entry to the logging AI for a fresh estimate.
  function editCandidate(c: Candidate) {
    setMName(c.name);
    setMNameZh(c.nameZh);
    setManualPreset({
      calories: c.calories,
      protein: c.protein,
      carbs: c.carbs,
      fat: c.fat,
      fiber: c.fiber,
      micros: c.micros ?? null,
    });
    switchTab("manual");
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/40"
      >
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={close}
        />
        <View className="rounded-t-3xl bg-surface px-4 pb-8 pt-3" style={{ maxHeight: "88%" }}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-surface-sunken" />
          <View className="mb-3 flex-row items-center justify-between">
            <ScalableText className="text-xl font-bold text-ink">{t("dashboard.addMeal")}</ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              onPress={close}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={24} color={colors.inkMuted} />
            </Pressable>
          </View>

          <MealTypePicker value={mealType} onChange={setMealType} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
          >
            {TABS.map(({ key, icon, labelKey }) => {
              const active = key === tab;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => switchTab(key)}
                  className={`min-h-[44px] flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
                    active ? "bg-ink" : "bg-surface-sunken"
                  }`}
                >
                  <Ionicons name={icon} size={16} color={active ? colors.white : colors.inkMuted} />
                  <ScalableText
                    className={`text-sm font-semibold ${active ? "text-white" : "text-ink-muted"}`}
                  >
                    {t(labelKey)}
                  </ScalableText>
                </Pressable>
              );
            })}
          </ScrollView>

          {tab !== "manual" && Number.isFinite(aiAccess.remainingLogs) && (
            <View className="mb-1 flex-row items-center gap-1.5 px-1">
              <Ionicons name="sparkles-outline" size={13} color={colors.inkFaint} />
              <ScalableText className="text-xs text-ink-faint">
                {aiAccess.remainingLogs > 0
                  ? tl(
                      `${aiAccess.remainingLogs} free AI logs left this week`,
                      `今個星期仲有 ${aiAccess.remainingLogs} 次 AI 入數`,
                    )
                  : tl(
                      "This week's AI logs are spent. Manual entry is still on us.",
                      "今個星期 AI 入數用晒，手動入數照樣免費。",
                    )}
              </ScalableText>
            </View>
          )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {tab === "photo" && (
              <View className="gap-3">
                <ScalableText className="text-sm text-ink-muted">{t("log.snapHint")}</ScalableText>
                <Button
                  label={loading ? t("log.recognising") : t("log.snap")}
                  icon="camera"
                  loading={loading}
                  onPress={() => runPhoto("camera")}
                />
                <Button
                  label={t("log.upload")}
                  icon="images"
                  variant="secondary"
                  disabled={loading}
                  onPress={() => runPhoto("library")}
                />
                {photoBlock && (
                  <View className="gap-2 rounded-xl bg-surface-sunken p-3">
                    <ScalableText
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className="text-sm leading-5 text-ink"
                    >
                      {t(photoBlock === "denied" ? "log.cameraOff" : "log.captureFailed")}
                    </ScalableText>
                    {photoBlock === "denied" && (
                      <Button
                        label={t("log.openSettings")}
                        icon="settings-outline"
                        variant="secondary"
                        onPress={() => void Linking.openSettings()}
                      />
                    )}
                  </View>
                )}
              </View>
            )}

            {tab === "voice" && (
              <View className="gap-3">
                <ScalableText className="text-sm text-ink-muted">{t("log.speakHint")}</ScalableText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tl("Fill in an example sentence", "填入示例句子")}
                  onPress={() => setText(VOICE_EXAMPLE)}
                  className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-4 py-3 active:opacity-80"
                >
                  <Ionicons name="mic" size={20} color={colors.brand} />
                  <ScalableText className="text-sm font-semibold text-brand">
                    {tl("Try an example", "試個例子")}
                  </ScalableText>
                </Pressable>
                <TextInput
                  className={`${INPUT} min-h-[72px]`}
                  multiline
                  value={text}
                  onChangeText={setText}
                  placeholder={t("log.speakExample")}
                  placeholderTextColor={colors.inkFaint}
                  textAlignVertical="top"
                />
                <Button
                  label={loading ? t("log.recognising") : t("log.parse")}
                  icon="sparkles-outline"
                  loading={loading}
                  onPress={runVoice}
                />
              </View>
            )}

            {tab === "barcode" && (
              <View className="gap-3">
                <ScalableText className="text-sm text-ink-muted">{t("log.scanHint")}</ScalableText>
                <Button
                  label={t("log.scanOpen")}
                  icon="camera-outline"
                  onPress={openScanner}
                />
                {/* Refused the camera. Not an error state: the field below still works, and saying
                    so is more use than a dead button. */}
                {cameraDenied && (
                  <ScalableText
                    accessibilityRole="alert"
                    className="text-sm leading-5 text-ink-muted"
                  >
                    {t("log.scanDenied")}
                  </ScalableText>
                )}
                <ScalableText className="text-sm text-ink-muted">{t("log.typeHint")}</ScalableText>
                <TextInput
                  className={INPUT}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="489..."
                  placeholderTextColor={colors.inkFaint}
                />
                <View className="flex-row flex-wrap gap-2">
                  {SAMPLE_CODES.map((s) => (
                    <Pressable
                      key={s.code}
                      accessibilityRole="button"
                      onPress={() => {
                        setCode(s.code);
                        runBarcode(s.code);
                      }}
                      className="min-h-[44px] justify-center rounded-full bg-surface-sunken px-4 py-2"
                    >
                      <ScalableText className="text-sm font-semibold text-ink">
                        {tl(s.label, s.labelZh)}
                      </ScalableText>
                    </Pressable>
                  ))}
                </View>
                <Button
                  label={t("common.search")}
                  icon="barcode-outline"
                  loading={loading}
                  onPress={() => runBarcode(code)}
                />
                {/* A barcode we do not have sends the user to manual entry. It used to offer to
                    read the 1+7 label off a photo, which nothing in the app could actually do. */}
                {barcodeMiss && (
                  <View className="gap-2 rounded-xl bg-surface-sunken p-3">
                    <ScalableText className="text-sm font-semibold text-ink">
                      {t("log.notFound")}
                    </ScalableText>
                    <Button
                      label={t("log.manual")}
                      icon="create-outline"
                      variant="secondary"
                      onPress={() => switchTab("manual")}
                    />
                  </View>
                )}
              </View>
            )}

            {tab === "manual" && (
              <View className="gap-3">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                >
                  {HK_DISHES.slice(0, 8).map((d) => (
                    <Pressable
                      key={d.name}
                      accessibilityRole="button"
                      onPress={() => {
                        setMName(d.name);
                        setMNameZh(d.nameZh);
                        setManualPreset({
                          calories: d.calories,
                          protein: d.protein,
                          carbs: d.carbs,
                          fat: d.fat,
                          fiber: 0, // curated HK dishes carry no measured fibre
                          micros: d.micros,
                        });
                        setManualMiss(false);
                      }}
                      className="min-h-[44px] justify-center rounded-full border border-[#E4DCCB] px-4 py-2"
                    >
                      <ScalableText className="text-sm text-ink">{tl(d.name, d.nameZh)}</ScalableText>
                    </Pressable>
                  ))}
                </ScrollView>
                <TextInput
                  className={INPUT}
                  value={mName}
                  onChangeText={(v) => {
                    setMName(v);
                    setManualPreset(null);
                    setManualMiss(false);
                  }}
                  placeholder={tl("Name (English)", "名稱（英文）")}
                  placeholderTextColor={colors.inkFaint}
                />
                <TextInput
                  className={INPUT}
                  value={mNameZh}
                  onChangeText={(v) => {
                    setMNameZh(v);
                    setManualPreset(null);
                    setManualMiss(false);
                  }}
                  placeholder={tl("Name (中文)", "名稱（中文）")}
                  placeholderTextColor={colors.inkFaint}
                />
                {/* Optional serving count. Leave it blank for one serving; anything else scales the
                    estimated nutrition. It never changes WHAT the dish is, so it doesn't re-trigger
                    the AI or clear a preset. */}
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className={`${INPUT} w-24`}
                    value={mQty}
                    onChangeText={setMQty}
                    keyboardType="decimal-pad"
                    placeholder={tl("Qty", "份量")}
                    placeholderTextColor={colors.inkFaint}
                  />
                  <ScalableText className="flex-1 text-xs text-ink-faint">
                    {tl("Servings (optional, default 1)", "份數（可選，預設 1）")}
                  </ScalableText>
                </View>
                {/* Numbers are the AI's job now: the user only says what they ate. Recognised
                    dishes fill instantly and free; a novel description spends one AI log. */}
                <View className="flex-row items-start gap-1.5 px-1">
                  <Ionicons name="sparkles-outline" size={13} color={colors.inkFaint} />
                  <ScalableText className="flex-1 text-xs text-ink-faint">
                    {tl(
                      "Type a dish or tap a tag and we'll fill in the nutrition. New dishes spend one AI log.",
                      "打菜名或者揀標籤，我哋幫你填營養。新菜式會用一次 AI 入數。",
                    )}
                  </ScalableText>
                </View>
                {manualMiss && (
                  <View className="rounded-xl bg-surface-sunken p-3">
                    <ScalableText className="text-sm text-ink">
                      {tl(
                        "Couldn't estimate that one. Try a quick-tag above, or rename it.",
                        "計唔到呢樣。試下上面嘅標籤，或者改個名。",
                      )}
                    </ScalableText>
                  </View>
                )}
                <Button
                  label={loading ? tl("Estimating your meal...", "幫你計緊營養...") : t("log.confirm")}
                  icon="add"
                  loading={loading}
                  onPress={addManual}
                />
              </View>
            )}

            {/* One banner for every AI-backed tab. It means "we could not ask", which is different
                from a miss ("we asked, the answer was nothing"): the alternative to saying so is
                showing invented macros, and these numbers land in someone's calorie ring. Sits
                outside the per-tab blocks because photo, voice and manual all raise the same flag. */}
            {aiError && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="mt-4 flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm leading-5 text-ink">
                  {t(aiError === "rate_limited" ? "log.aiRateLimited" : "log.aiUnavailable")}
                </ScalableText>
              </View>
            )}

            {aiMiss && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="mt-4 flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
              >
                <Ionicons name="help-circle-outline" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm leading-5 text-ink">
                  {t("log.aiNoResult")}
                </ScalableText>
              </View>
            )}

            {candidates.length > 0 && (
              <View className="mt-4 gap-3">
                {/* One tap to log a whole voice order or multi-dish photo. Only shown when there is
                    more than one line: a single slip is added with its own card button. */}
                {candidates.length > 1 && (
                  <Button
                    label={t("log.addAll", { count: candidates.length })}
                    icon="checkmark-done"
                    onPress={commitAll}
                  />
                )}
                {candidates.map((c, i) => {
                  const meta = c.portionLabel
                    ? tl(c.portionLabel, c.portionLabelZh ?? c.portionLabel)
                    : c.unit ?? "";
                  return (
                    <View
                      key={`${c.name}-${i}`}
                      className="overflow-hidden rounded-xl border border-[#E4DCCB] bg-surface"
                    >
                      {/* Order slip (飛單): clipped ticket header with a perforated edge. */}
                      <View className="flex-row items-center justify-between border-b border-dashed border-[#D8CDB8] bg-surface-subtle px-3 py-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="receipt-outline" size={13} color={colors.inkMuted} />
                          <ScalableText className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                            {tl("Order slip", "飛單")}
                          </ScalableText>
                        </View>
                        {c.confidence !== undefined && (
                          <ScalableText className="text-[11px] font-semibold text-ink-muted">
                            {Math.round(c.confidence * 100)}%
                          </ScalableText>
                        )}
                      </View>
                      <View className="gap-2 p-3">
                        <View className="flex-row items-start justify-between gap-2">
                          <ScalableText
                            className="flex-1 text-base font-bold text-ink"
                            numberOfLines={2}
                          >
                            {tl(c.name, c.nameZh)}
                          </ScalableText>
                          <View className="flex-row items-baseline gap-1">
                            <ScalableText className="text-base font-bold text-ink">
                              {formatCalories(c.calories)}
                            </ScalableText>
                            <ScalableText className="text-xs text-ink-faint">kcal</ScalableText>
                          </View>
                        </View>
                        <View className="flex-row items-center justify-between border-t border-dashed border-[#E4DCCB] pt-2">
                          <ScalableText className="text-xs text-ink-muted">
                            P {Math.round(c.protein)}g · C {Math.round(c.carbs)}g · F{" "}
                            {Math.round(c.fat)}g
                          </ScalableText>
                          {meta ? (
                            <ScalableText className="text-xs text-ink-faint" numberOfLines={1}>
                              {meta}
                            </ScalableText>
                          ) : null}
                        </View>
                        <View className="flex-row gap-2 pt-1">
                          <Button
                            label={t("log.confirm")}
                            icon="add"
                            className="flex-1"
                            onPress={() => commit(c)}
                          />
                          <Button
                            label={t("log.correct")}
                            variant="secondary"
                            className="flex-1"
                            onPress={() => editCandidate(c)}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
                {/* Guideline 1.4.1: the order slips above are the moment a health figure is put in
                    front of someone, so the way to the sources sits with them. Photo and voice
                    estimates come from the AI, a scanned barcode comes from Open Food Facts, and
                    the sources screen names both. */}
                <SourcesLink />
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Live barcode scanner. An absolute overlay inside this Modal rather than a nested Modal:
          stacking Modals on iOS fights the sheet's own slide animation, and the camera has to be
          gone the instant a code decodes. Mounted only while open so the camera is released the
          moment it is not needed. */}
      {scannerOpen && (
        <View className="absolute inset-0 bg-black">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_FORMATS] }}
            onBarcodeScanned={({ data }) => handleScanned(data)}
          />
          <SafeAreaView edges={["top", "bottom"]} className="absolute inset-0 justify-between">
            <View className="flex-row items-start justify-between p-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
                onPress={closeScanner}
                className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
              >
                <Ionicons name="close" size={24} color={colors.white} />
              </Pressable>
              <View className="flex-1 items-center px-3">
                <ScalableText className="text-center text-base font-bold text-white">
                  {t("log.scanTitle")}
                </ScalableText>
                <ScalableText className="text-center text-xs text-white/80">
                  {t("log.scanAim")}
                </ScalableText>
              </View>
              {/* Spacer so the title stays optically centred against the close button. */}
              <View className="h-11 w-11" />
            </View>

            {/* A window to line the barcode up in. Purely a sighting aid: CameraView reads the
                whole frame, so a code outside this box still scans. */}
            <View className="items-center">
              <View className="h-32 w-4/5 rounded-2xl border-2 border-white/80" />
            </View>

            <View className="items-center pb-6">
              <Pressable
                accessibilityRole="button"
                onPress={closeScanner}
                className="min-h-[44px] justify-center rounded-full bg-black/60 px-5"
              >
                <ScalableText className="text-sm font-semibold text-white">
                  {t("log.scanTypeInstead")}
                </ScalableText>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      )}
    </Modal>

    {/* Contextual paywall: pops over the sheet when the weekly AI quota is spent. Manual entry
        stays reachable on the sheet behind it. */}
    <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </>
  );
}
