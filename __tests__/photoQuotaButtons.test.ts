import { photoButtons } from "@/utils/photoQuotaButtons";

// Owner, 2026-10-18: the free photo limit was a faint line nobody saw, so it now sits on the photo
// buttons themselves. Pro and Max see the plain buttons. Daily since 2026-11-17 (one a day).
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

  it("puts what's left today on the camera button, once", () => {
    expect(photoButtons(1, false, LABELS, ZH)).toEqual({
      camera: { label: "影低你碟嘢 · 今日剩 1 次", icon: "camera" },
      upload: { label: "揀返張相入數", icon: "images" },
    });
  });

  it("says it in English too", () => {
    const en = { snap: "Snap your dish", upload: "Upload a photo", recognising: "Recognising…" };
    expect(photoButtons(1, false, en, EN).camera.label).toBe("Snap your dish · 1 left today");
    expect(photoButtons(0, false, en, EN).camera.label).toBe("Used up today · Go Pro / Max");
  });

  // Owner, 2026-10-19: say why it's locked AND name both paid plans, so the button doesn't hide Max.
  it("locks both buttons once today's free photo log is used, offering both paid plans", () => {
    expect(photoButtons(0, false, LABELS, ZH)).toEqual({
      camera: { label: "今日次數用晒 · 升級 Pro／Max", icon: "lock-closed" },
      upload: { label: "揀返張相入數", icon: "lock-closed" },
    });
  });

  it("shows the recognising label while a photo is being read", () => {
    expect(photoButtons(1, true, LABELS, ZH).camera).toEqual({ label: "認緊…", icon: "camera" });
  });
});
