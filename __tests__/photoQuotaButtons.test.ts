import { photoButtons } from "@/utils/photoQuotaButtons";

// Owner, 2026-10-18: the free weekly photo limit was a faint line nobody saw, so it now sits on the
// photo buttons themselves. Pro and Max see the plain buttons.
const LABELS = { snap: "影低你碟嘢", upload: "揀返張相入數", recognising: "認緊…" };
const EN = (en: string) => en;
const ZH = (_en: string, zh: string) => zh;

describe("photoButtons", () => {
  it("shows plain buttons on Pro and Max, who have no limit", () => {
    expect(photoButtons(Number.POSITIVE_INFINITY, false, LABELS, ZH)).toEqual({
      camera: { label: "影低你碟嘢", icon: "camera" },
      upload: { label: "揀返張相入數", icon: "images" },
    });
  });

  it("puts what's left this week on the camera button, once", () => {
    expect(photoButtons(2, false, LABELS, ZH)).toEqual({
      camera: { label: "影低你碟嘢 · 本週剩 2 次", icon: "camera" },
      upload: { label: "揀返張相入數", icon: "images" },
    });
    expect(photoButtons(1, false, LABELS, ZH).camera.label).toBe("影低你碟嘢 · 本週剩 1 次");
  });

  it("says it in English too", () => {
    const en = { snap: "Snap your dish", upload: "Upload a photo", recognising: "Recognising…" };
    expect(photoButtons(2, false, en, EN).camera.label).toBe("Snap your dish · 2 left this week");
    expect(photoButtons(0, false, en, EN).camera.label).toBe("Free scans used up · Go Pro");
  });

  it("locks both buttons once the week's free scans are used up", () => {
    expect(photoButtons(0, false, LABELS, ZH)).toEqual({
      camera: { label: "本週免費次數用晒 · 升級 Pro", icon: "lock-closed" },
      upload: { label: "揀返張相入數", icon: "lock-closed" },
    });
  });

  it("shows the recognising label while a photo is being read", () => {
    expect(photoButtons(1, true, LABELS, ZH).camera).toEqual({ label: "認緊…", icon: "camera" });
  });
});
