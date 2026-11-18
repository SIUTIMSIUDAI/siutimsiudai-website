import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  visible: boolean;
  onClose: () => void;
}

// The contextual paywall that pops when a free user has spent today's free photo log and
// reaches for another. It floats over the log sheet, so manual entry stays free right behind it;
// the Milk Tea Amber CTA hands off to the full subscription screen. Positioning stays strictly
// nutrition-ledger: this is a metabolic bookkeeping quota, never a food-ordering limit.
export function PaywallModal({ visible, onClose }: Props) {
  const { tl } = useLocale();

  // Dismiss the modal first, then route to the paywall so the log sheet isn't left stacked
  // underneath the subscription screen.
  function onUnlock() {
    onClose();
    router.push("/subscription");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        {/* Tap-off backdrop. Dismissing drops the user back on the log sheet with manual entry. */}
        <Pressable
          className="absolute inset-0"
          accessibilityRole="button"
          accessibilityLabel={tl("Dismiss", "唔使住")}
          onPress={onClose}
        />

        <View
          className="w-full max-w-[360px] items-center gap-4 rounded-3xl bg-surface p-6"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand/10">
            <Ionicons name="sparkles" size={30} color={colors.brand} />
          </View>

          <ScalableText className="text-center text-xl font-bold text-ink">
            {tl("Today's Free Photo Log Is Used", "今日嘅免費影相入數用咗喇！")}
          </ScalableText>

          <ScalableText className="text-center text-sm leading-6 text-ink-muted">
            {tl(
              "Boss, today's free AI photo log is spent! Typing and voice logs stay free and unlimited, and tomorrow brings another photo. Want to snap every meal? Upgrade to Pro to unlock unlimited AI photo recognition.",
              "老細，今日嘅免費 AI 影相入數用咗喇！打字同語音記錄照樣免費無限用，聽日又有一次。想餐餐都影相入數？升級 Pro，即刻解鎖無限次 AI 影相識別。",
            )}
          </ScalableText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tl("Unlock Unlimited AI Logs", "解鎖無限次 AI 記帳")}
            onPress={onUnlock}
            className="mt-1 min-h-[48px] w-full flex-row items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 active:opacity-90"
          >
            <Ionicons name="sparkles" size={18} color={colors.white} />
            <ScalableText className="text-base font-bold text-white">
              {tl("Unlock Unlimited AI Logs", "解鎖無限次 AI 記帳")}
            </ScalableText>
          </Pressable>

          {/* Escape hatch: manual entry never gates, so let them back out gracefully. */}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="min-h-[44px] w-full items-center justify-center py-1"
          >
            <ScalableText className="text-sm font-semibold text-ink-faint">
              {tl("Maybe later, typing, voice and barcode stay free", "遲啲先，打字、語音同掃碼照樣免費")}
            </ScalableText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
