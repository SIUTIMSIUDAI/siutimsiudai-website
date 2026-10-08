import { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import {
  imageTypeOf,
  PantryScanOutcome,
  pantryVisionService,
  RECEIPT_MAX_PHOTOS,
  receiptFits,
  ReceiptPhoto,
} from "@/services/pantryVisionService";
import type { InvokeFailure } from "@/services/functionError";
import { ScanSource, usePantryScanStore } from "@/stores/pantryScanStore";

// One receipt photo waiting to be read: the image data, plus its local file for the thumbnail.
interface Shot extends ReceiptPhoto {
  uri: string;
}

// Receipts are text, and up to three go up together, so they are shot a little lighter than a
// fridge photo. Still sharp enough for the model to read the print.
const RECEIPT_QUALITY = 0.4;

// Custom in-app camera for the AI pantry scanner. Uses expo-camera's CameraView (works in Expo Go,
// no dev build needed) rather than the OS image picker, so scanning feels like one seamless flow.
// Two modes: Fridge photographs what you have, one shot read straight away; Receipt reads what you
// bought, from up to three photos (camera or library) of one receipt, sent together. Either way the
// guesses go to the review screen for editing, and nothing saves from here. A failed scan stops on
// this screen and says so: we never advance to review with ingredients the user did not photograph.
export default function PantryScanScreen() {
  const { t } = useLocale();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const setDraft = usePantryScanStore((s) => s.setDraft);

  const [mode, setMode] = useState<ScanSource>("fridge");
  const [shots, setShots] = useState<Shot[]>([]);
  const [scanning, setScanning] = useState(false);
  // Why the scan failed, not merely that it did. "rate_limited" is the daily per-user cap, where
  // the shutter is no longer the retry and telling them to try again would be a lie.
  const [failed, setFailed] = useState<InvokeFailure | null>(null);
  const [tooBig, setTooBig] = useState(false);
  // Set synchronously, unlike `scanning`, so a quick double tap can't spend two AI uses.
  const inFlight = useRef(false);

  const full = shots.length >= RECEIPT_MAX_PHOTOS;

  function switchMode(next: ScanSource) {
    setMode(next);
    setFailed(null);
    setTooBig(false);
  }

  function addShots(added: Shot[]) {
    setShots((prev) => [...prev, ...added].slice(0, RECEIPT_MAX_PHOTOS));
    setFailed(null);
    setTooBig(false);
  }

  function removeShot(index: number) {
    setShots((prev) => prev.filter((_, i) => i !== index));
    setTooBig(false);
  }

  // Send the guesses to review. replace (not push) so Back from the review screen returns to the
  // Pantry tab, not the camera.
  function review(outcome: PantryScanOutcome, source: ScanSource) {
    if (!outcome.ok) {
      // Configured but could not read the photos. Stay put, tell the truth, let them try again,
      // unless the reason was the daily cap.
      setFailed(outcome.error);
      setScanning(false);
      inFlight.current = false;
      return;
    }
    setDraft(outcome.items, source);
    router.replace("/pantry-review");
  }

  async function captureFridge() {
    if (inFlight.current || !cameraRef.current) return;
    inFlight.current = true;
    setScanning(true);
    setFailed(null);
    try {
      // Low quality + base64 keeps the payload small enough for the Edge Function round-trip; the
      // vision model only needs to recognise ingredients, not read fine print.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      review(await pantryVisionService.scan(photo?.base64 ?? ""), "fridge");
    } catch {
      // Capture itself failed: same honest treatment, camera stays usable. Never the cap, since
      // this path never reached the network.
      setFailed("unavailable");
      setScanning(false);
      inFlight.current = false;
    }
  }

  async function shootReceipt() {
    if (scanning || full || !cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: RECEIPT_QUALITY, base64: true });
      if (photo?.base64) addShots([{ uri: photo.uri, base64: photo.base64, mediaType: "image/jpeg" }]);
    } catch {
      setFailed("unavailable");
    }
  }

  async function pickReceiptPhotos() {
    const room = RECEIPT_MAX_PHOTOS - shots.length;
    if (scanning || room <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: room,
        quality: RECEIPT_QUALITY,
        base64: true,
      });
      if (result.canceled) return;
      addShots(
        result.assets.flatMap((asset) =>
          asset.base64
            ? [{ uri: asset.uri, base64: asset.base64, mediaType: imageTypeOf(asset.base64) }]
            : [],
        ),
      );
    } catch {
      setFailed("unavailable");
    }
  }

  async function readReceipt() {
    if (inFlight.current || shots.length === 0) return;
    if (!receiptFits(shots)) {
      setTooBig(true);
      return;
    }
    inFlight.current = true;
    setScanning(true);
    setFailed(null);
    setTooBig(false);
    try {
      review(
        await pantryVisionService.scanReceipt(shots.map(({ base64, mediaType }) => ({ base64, mediaType }))),
        "receipt",
      );
    } catch {
      setFailed("unavailable");
      setScanning(false);
      inFlight.current = false;
    }
  }

  // Permission still loading (null on first mount).
  if (!permission) {
    return <View className="flex-1 bg-charcoal" />;
  }

  // Not granted yet: a plain, on-brand request screen instead of a black camera.
  if (!permission.granted) {
    return (
      <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-surface-subtle">
        <View className="flex-row justify-end px-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
            <Ionicons name="camera-outline" size={30} color={colors.brand} />
          </View>
          <ScalableText className="text-center text-xl font-bold text-ink">
            {t("pantryScan.permissionTitle")}
          </ScalableText>
          <ScalableText className="text-center text-sm leading-5 text-ink-muted">
            {t("pantryScan.permissionBody")}
          </ScalableText>
          <View className="mt-2 w-full">
            <Button label={t("pantryScan.grant")} icon="camera" onPress={requestPermission} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const receipt = mode === "receipt";

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* Controls float above the live preview. */}
      <SafeAreaView edges={["top", "bottom"]} className="absolute inset-0 justify-between">
        <View className="gap-3 p-3">
          <View className="flex-row items-start justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              onPress={() => router.back()}
              className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
            >
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
            {/* A dark backing so the white text stays readable over white paper. */}
            <View className="mx-2 flex-1 items-center rounded-2xl bg-black/50 px-3 py-1.5">
              <ScalableText className="text-center text-base font-bold text-white">
                {t(receipt ? "pantryScan.receiptTitle" : "pantryScan.title")}
              </ScalableText>
              <ScalableText className="text-center text-xs text-white/80">
                {t(receipt ? "pantryScan.receiptHint" : "pantryScan.hint")}
              </ScalableText>
            </View>
            {/* Spacer to balance the close button so the title stays centred. */}
            <View className="h-11 w-11" />
          </View>

          {/* Fridge | Receipt. */}
          <View className="flex-row self-center rounded-full bg-black/50 p-1">
            {(["fridge", "receipt"] as const).map((m) => {
              const on = mode === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(m === "fridge" ? "pantryScan.modeFridge" : "pantryScan.modeReceipt")}
                  onPress={() => switchMode(m)}
                  disabled={scanning}
                  className={`min-h-[44px] min-w-[96px] items-center justify-center rounded-full px-4 ${
                    on ? "bg-white" : ""
                  }`}
                >
                  <ScalableText
                    className={`text-sm font-semibold ${on ? "text-ink" : "text-white"}`}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t(m === "fridge" ? "pantryScan.modeFridge" : "pantryScan.modeReceipt")}
                  </ScalableText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="items-center gap-4 pb-6">
          {/* Honest failure state. Sits right above the shutter so the retry is the obvious move. */}
          {(failed || tooBig) && !scanning && (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="mx-6 flex-row items-start gap-2 self-stretch rounded-2xl bg-black/75 px-4 py-3"
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.white} />
              <ScalableText className="flex-1 text-sm leading-5 text-white">
                {t(
                  tooBig
                    ? "pantryScan.tooLarge"
                    : failed === "rate_limited"
                      ? "pantryScan.rateLimited"
                      : "pantryScan.failed",
                )}
              </ScalableText>
            </View>
          )}

          {/* The receipt photos so far, each removable. */}
          {receipt && shots.length > 0 && (
            <View className="flex-row items-center gap-3">
              {shots.map((shot, index) => (
                <View key={`${index}-${shot.uri}`}>
                  <Image
                    source={{ uri: shot.uri }}
                    accessibilityIgnoresInvertColors
                    style={{ width: 56, height: 80, borderRadius: 8, borderWidth: 2, borderColor: colors.white }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("pantryScan.removePhoto", { count: index + 1 })}
                    onPress={() => removeShot(index)}
                    disabled={scanning}
                    hitSlop={8}
                    className="absolute -right-2 -top-2 h-7 w-7 items-center justify-center rounded-full bg-black"
                  >
                    <Ionicons name="close" size={16} color={colors.white} />
                  </Pressable>
                </View>
              ))}
              <View className="rounded-full bg-black/60 px-2.5 py-1">
                <ScalableText className="text-xs font-semibold text-white" maxFontSizeMultiplier={1.3}>
                  {t("pantryScan.photoCount", { count: shots.length })}
                </ScalableText>
              </View>
            </View>
          )}

          <View className="w-full flex-row items-center justify-center gap-6 px-6">
            {receipt ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("pantryScan.library")}
                onPress={pickReceiptPhotos}
                disabled={scanning || full}
                className={`h-14 w-20 items-center justify-center gap-0.5 rounded-2xl bg-black/50 ${
                  full ? "opacity-40" : "active:opacity-70"
                }`}
              >
                <Ionicons name="images-outline" size={22} color={colors.white} />
                <ScalableText className="text-xs font-semibold text-white" maxFontSizeMultiplier={1.3}>
                  {t("pantryScan.library")}
                </ScalableText>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("pantryScan.capture")}
              accessibilityState={{ disabled: scanning || (receipt && full) }}
              onPress={receipt ? shootReceipt : captureFridge}
              disabled={scanning || (receipt && full)}
              className={`h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/30 ${
                receipt && full ? "opacity-40" : "active:opacity-70"
              }`}
            >
              {scanning && !receipt ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <View className="h-14 w-14 rounded-full bg-white" />
              )}
            </Pressable>

            {receipt ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("pantryScan.read")}
                accessibilityState={{ disabled: scanning || shots.length === 0 }}
                onPress={readReceipt}
                disabled={scanning || shots.length === 0}
                className={`h-14 w-24 items-center justify-center gap-0.5 rounded-2xl bg-brand ${
                  shots.length === 0 ? "opacity-40" : "active:opacity-80"
                }`}
              >
                <Ionicons name="receipt-outline" size={22} color={colors.white} />
                <ScalableText className="text-xs font-semibold text-white" maxFontSizeMultiplier={1.3}>
                  {t("pantryScan.read")}
                </ScalableText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {/* Full-screen veil while the AI works. */}
      {scanning && (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-black/60">
          <ActivityIndicator size="large" color={colors.white} />
          <ScalableText className="text-base font-semibold text-white">
            {t(receipt ? "pantryScan.readingReceipt" : "pantryScan.scanning")}
          </ScalableText>
        </View>
      )}
    </View>
  );
}
