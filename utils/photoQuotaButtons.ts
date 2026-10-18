// The two photo buttons on the log sheet, with the free plan's weekly photo limit shown on them
// (owner, 2026-10-18: the faint line above the buttons went unnoticed). Pure, so every state is
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
 * Labels and icons for the camera and upload buttons. `remaining` is this week's free photo scans
 * left: Infinity on Pro and Max, which see the plain buttons. Camera and upload share one allowance,
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
    camera = { label: tl("Free scans used up · Go Pro", "本週免費次數用晒 · 升級 Pro"), icon: "lock-closed" };
  } else {
    camera = {
      label: `${labels.snap} · ${tl(`${remaining} left this week`, `本週剩 ${remaining} 次`)}`,
      icon: "camera",
    };
  }
  return { camera, upload: { label: labels.upload, icon: usedUp ? "lock-closed" : "images" } };
}
