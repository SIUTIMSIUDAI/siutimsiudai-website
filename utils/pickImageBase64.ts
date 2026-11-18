import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

// The result of trying to grab one image as base64. Mirrors the union LogInputSheet needs: the
// camera path can be permission-"denied"; the picker can throw ("error"); the user can cancel.
export type ImageCaptureResult =
  | { status: "ok"; uri: string; base64: string }
  | { status: "cancel" }
  | { status: "denied" }
  | { status: "error" };

export interface PickImageOptions {
  // Crop to a square and save smaller: a profile photo is only ever shown small.
  square?: boolean;
}

// Resolve one image (as raw base64 JPEG, no data: prefix) from the camera or the photo library.
// "camera" asks permission and returns "denied" on refusal rather than silently falling through;
// "library" (and web, which has no in-preview camera) needs no permission on iOS. Never throws.
// quality 0.5 keeps the payload real while giving Gemini enough detail to name a dish. Square photos
// use the picker's own crop and quality 0.3 instead, because no resize library is in the binary.
export async function pickImageBase64(
  source: "camera" | "library",
  { square = false }: PickImageOptions = {},
): Promise<ImageCaptureResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: square ? 0.3 : 0.5,
    base64: true,
    ...(square ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
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
    if (!asset.base64) return { status: "cancel" };
    return { status: "ok", uri: asset.uri, base64: asset.base64 };
  } catch {
    return { status: "error" };
  }
}
