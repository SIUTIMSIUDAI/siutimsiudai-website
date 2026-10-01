import { type ComponentProps, useRef } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

export interface ActionSheetOption {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  // Shown in red, for an option that deletes something.
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  options: ActionSheetOption[];
  onClose: () => void;
}

const DESTRUCTIVE = "#C2554B";

// A bottom sheet of choices plus Cancel, built from our own Modal so it behaves the same on web and
// native. A chosen option runs only once the sheet has closed: iOS will not present another screen
// (such as the photo picker) while a modal is still animating away, and drops it without a word.
// Modal reports that moment (onDismiss) on iOS only, so elsewhere the option runs straight away, and
// a timer covers an iOS dismissal that never reports.
export function ActionSheet({ visible, options, onClose }: Props) {
  const { t } = useLocale();
  const pending = useRef<(() => void) | null>(null);

  function runPending() {
    const action = pending.current;
    pending.current = null;
    action?.();
  }

  function choose(option: ActionSheetOption) {
    onClose();
    if (Platform.OS !== "ios") {
      option.onPress();
      return;
    }
    pending.current = option.onPress;
    setTimeout(runPending, 700);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={runPending}
    >
      <View className="flex-1 justify-end">
        {/* The backdrop sits behind the sheet rather than around it, so no button holds another. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="gap-2 rounded-t-3xl bg-surface px-4 pb-10 pt-4">
          {options.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => choose(option)}
              className="min-h-[52px] flex-row items-center gap-3 rounded-xl bg-surface-sunken px-4 active:opacity-70"
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={option.destructive ? DESTRUCTIVE : colors.ink}
              />
              <ScalableText
                className="flex-1 text-base font-semibold"
                style={{ color: option.destructive ? DESTRUCTIVE : colors.ink }}
              >
                {option.label}
              </ScalableText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            className="min-h-[52px] items-center justify-center rounded-xl active:opacity-70"
          >
            <ScalableText className="text-base font-semibold text-ink-muted">
              {t("common.cancel")}
            </ScalableText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
