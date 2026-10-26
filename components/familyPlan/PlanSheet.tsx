import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body, for the sheet's main button. */
  footer?: ReactNode;
  /** The close button's spoken label, for a sheet shown in another language (helper mode). */
  closeLabel?: string;
}

/** The bottom sheet every family-plan panel opens in. */
export function PlanSheet({ visible, title, onClose, children, footer, closeLabel }: Props) {
  const { t } = useLocale();
  const close = closeLabel ?? t("familyPlan.close");
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" accessibilityRole="button" accessibilityLabel={close} onPress={onClose} />
        <View className="rounded-t-3xl bg-surface px-4 pb-8 pt-3" style={{ maxHeight: "85%" }}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-surface-sunken" />
          <View className="mb-2 flex-row items-center justify-between gap-2">
            <ScalableText className="flex-1 text-xl font-bold text-ink" numberOfLines={2}>
              {title}
            </ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={close}
              onPress={onClose}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={24} color={colors.inkMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
