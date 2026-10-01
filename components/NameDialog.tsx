import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  visible: boolean;
  // The saved name to start from, or null when none is set.
  initial: string | null;
  // Saves the typed name. Resolves false when it could not be saved.
  onSave: (name: string) => Promise<boolean>;
  onClose: () => void;
}

// "How should we call you?" as a small centred dialog, opened by tapping the name on Profile. Built
// like ConfirmDialog from our own Modal, so web and native match; on iOS the keyboard pushes it up.
export function NameDialog({ visible, initial, onSave, onClose }: Props) {
  const { t, tl } = useLocale();
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Start from the saved name every time the dialog opens.
  useEffect(() => {
    if (visible) {
      setText(initial ?? "");
      setFailed(false);
    }
  }, [visible, initial]);

  async function save() {
    setSaving(true);
    setFailed(false);
    const ok = await onSave(text);
    setSaving(false);
    if (ok) onClose();
    else setFailed(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          {/* The backdrop sits behind the card rather than around it, so no button holds another. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            className="absolute inset-0 bg-black/40"
          />
          <View className="w-full max-w-md gap-4 rounded-3xl bg-surface p-5">
            <ScalableText className="text-lg font-bold text-ink">{t("profile.nameLabel")}</ScalableText>
            <TextInput
              className="rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink"
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void save()}
              placeholder={t("profile.namePlaceholder")}
              placeholderTextColor={colors.inkFaint}
              maxLength={40}
              autoFocus
              returnKeyType="done"
            />
            {failed ? (
              <ScalableText className="text-xs text-[#C0392B]">
                {tl(
                  "Your name could not be saved. Please check your connection and try again.",
                  "未能儲存名稱，請檢查網絡後再試。",
                )}
              </ScalableText>
            ) : null}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
              </View>
              <View className="flex-1">
                <Button label={t("common.save")} loading={saving} onPress={() => void save()} />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
