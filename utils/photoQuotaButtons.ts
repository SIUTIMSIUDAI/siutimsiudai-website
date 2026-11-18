// The two photo buttons on the log sheet, with the free plan's daily photo limit shown on them
// (owner, 2026-10-18: the faint line above the buttons went unnoticed; daily since 2026-11-17). Pure, so every state is
// unit-tested without rendering the sheet.

type Tl = (en: string, zh: string) => string;

export interface PhotoButton {
  label: string;
  icon: "camera" | "images" | "lock-closed";
}

export interface PhotoButtonLabels {
  snap: string;
  upload: string;
  recognising: string;
}

/**
 * Labels and icons for the camera and upload buttons. `remaining` is today's free photo logs left:
 * Infinity on Pro and Max, which see the plain buttons. Camera and upload share one allowance,
 * so the count shows once, on the camera button, rather than reading as two allowances. With none
 * left, both buttons lock; tapping either still opens the upgrade pop-up.
 */
export function photoButtons(
  remaining: number,
  loading: boolean,
  labels: PhotoButtonLabels,
  tl: Tl,
): { camera: PhotoButton; upload: PhotoButton } {
  const usedUp = Number.isFinite(remaining) && remaining <= 0;
  let camera: PhotoButton;
  if (loading) {
    camera = { label: labels.recognising, icon: "camera" };
  } else if (!Number.isFinite(remaining)) {
    camera = { label: labels.snap, icon: "camera" };
  } else if (usedUp) {
    camera = {
      label: tl("Used up today · Go Pro / Max", "今日次數用晒 · 升級 Pro／Max"),
      icon: "lock-closed",
    };
  } else {
    camera = {
      label: `${labels.snap} · ${tl(`${remaining} left today`, `今日剩 ${remaining} 次`)}`,
      icon: "camera",
    };
  }
  return { camera, upload: { label: labels.upload, icon: usedUp ? "lock-closed" : "images" } };
}
