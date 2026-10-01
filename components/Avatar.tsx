import { type ComponentProps, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/theme";

interface Props {
  // A signed link to the photo, or nothing for none.
  uri: string | null | undefined;
  size: number;
  // Shown on the sunken circle when there is no photo, or it fails to load (an expired link).
  fallbackIcon: ComponentProps<typeof Ionicons>["name"];
}

// A round profile photo, falling back to an icon on the sunken circle.
export function Avatar({ uri, size, fallbackIcon }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      className="items-center justify-center rounded-full bg-surface-sunken"
      style={{ width: size, height: size }}
    >
      <Ionicons name={fallbackIcon} size={Math.round(size * 0.45)} color={colors.inkMuted} />
    </View>
  );
}
