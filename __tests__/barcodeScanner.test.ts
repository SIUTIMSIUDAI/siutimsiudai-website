// The barcode tab shipped for months telling the user to "line up the barcode" above a number pad.
// There was no camera in it. The instruction was camera language, the control was a keyboard, and
// nothing in the repo noticed, because copy and capability are edited in different files by
// different people at different times.
//
// Two independent things are pinned here.
//
//   1. The latch. A camera reader reports the same code every frame it can resolve one, so the
//      difference between "one scan" and "forty lookups" is a single boolean. It now lives in a
//      pure function so the guarantee can be stated rather than assumed.
//
//   2. Copy against capability. Asking the camera requires NSCameraUsageDescription to justify the
//      ask, and Apple reads that string against what the app actually does. If the barcode copy
//      ever promises scanning again, the permission string has to admit to it in the same commit.
//      This does not prove the camera is wired up, but it does prove the app's own account of
//      itself is internally consistent, which is exactly what was broken before.

import { readFileSync } from "fs";
import { join } from "path";

import { createScanLatch } from "@/utils/scanLatch";
import en from "@/i18n/en.json";
import zhHant from "@/i18n/zh-Hant.json";

const REPO_ROOT = join(__dirname, "..");

const appJson = JSON.parse(readFileSync(join(REPO_ROOT, "app.json"), "utf8")) as {
  expo: {
    ios: { infoPlist: Record<string, unknown> };
    plugins: (string | [string, Record<string, unknown>])[];
  };
};

describe("createScanLatch — one opening of the scanner, one lookup", () => {
  it("accepts the first code and refuses every repeat of the same frame burst", () => {
    const latch = createScanLatch();
    expect(latch.accept()).toBe(true);
    // A packet held in front of the lens for a second, at 30fps.
    for (let i = 0; i < 30; i += 1) {
      expect(latch.accept()).toBe(false);
    }
  });

  it("re-arms when the scanner is opened again, so a second scan still works", () => {
    const latch = createScanLatch();
    expect(latch.accept()).toBe(true);
    expect(latch.accept()).toBe(false);
    latch.rearm();
    expect(latch.accept()).toBe(true);
  });

  it("does not remember the value, so re-scanning the same packet is allowed", () => {
    // Deliberate: a user who scanned a tin, logged it, and wants to log a second tin should not be
    // silently ignored because the digits match.
    const latch = createScanLatch();
    latch.accept();
    latch.rearm();
    expect(latch.accept()).toBe(true);
  });

  it("is armed from the start, so the first frame after opening is never dropped", () => {
    expect(createScanLatch().accept()).toBe(true);
  });

  it("hands out independent latches", () => {
    const a = createScanLatch();
    const b = createScanLatch();
    a.accept();
    expect(a.accept()).toBe(false);
    expect(b.accept()).toBe(true);
  });
});

describe("the barcode copy and the camera permission agree", () => {
  const cameraUsage = appJson.expo.ios.infoPlist.NSCameraUsageDescription as string;

  // Every string the barcode tab renders, in both languages.
  const barcodeCopy = [
    en.log.scanHint,
    en.log.scanOpen,
    en.log.scanTitle,
    en.log.scanAim,
    en.log.scanTypeInstead,
    en.log.scanDenied,
    en.log.typeHint,
    zhHant.log.scanHint,
    zhHant.log.scanOpen,
    zhHant.log.scanTitle,
    zhHant.log.scanAim,
    zhHant.log.scanTypeInstead,
    zhHant.log.scanDenied,
    zhHant.log.typeHint,
  ];

  it("has every barcode string present and non-empty in both languages", () => {
    for (const s of barcodeCopy) {
      expect(typeof s).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("declares barcode scanning in NSCameraUsageDescription", () => {
    // The app asks for the camera on the barcode tab. Apple rejects a purpose string that does not
    // account for a use the app plainly makes (Guideline 5.1.1).
    expect(cameraUsage.toLowerCase()).toContain("barcode");
  });

  it("still declares the other two camera uses it had before", () => {
    // Widening the string for barcodes must not quietly drop the meal or pantry justification.
    expect(cameraUsage.toLowerCase()).toContain("meal");
    expect(cameraUsage.toLowerCase()).toContain("kitchen");
  });

  it("keeps the expo-camera plugin permission in step with the Info.plist one", () => {
    // Two strings, one prompt: the plugin's cameraPermission is what actually reaches the built
    // Info.plist, so a fix applied to only one of them is not applied at all.
    const plugin = appJson.expo.plugins.find(
      (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === "expo-camera",
    );
    expect(plugin).toBeDefined();
    expect(plugin?.[1].cameraPermission).toBe(cameraUsage);
  });

  it("tells the user the typed field is still there, in both languages", () => {
    // The keyboard is the fallback for a refused permission, a simulator, and a creased packet.
    // If scanning is offered, not-scanning has to be offered beside it.
    expect(en.log.scanDenied.toLowerCase()).toContain("type");
    expect(zhHant.log.scanDenied).toContain("輸入");
  });
});

describe("the two locales stay in step", () => {
  // The barcode work added seven keys. Adding six of them to one file and forgetting the seventh
  // shows up as a raw key rendered on screen, in whichever language nobody on the team reads.
  function flatten(o: unknown, prefix = ""): string[] {
    if (typeof o !== "object" || o === null) return [prefix];
    return Object.entries(o).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }

  it("defines exactly the same keys in en and zh-Hant", () => {
    expect(flatten(en).sort()).toEqual(flatten(zhHant).sort());
  });
});
