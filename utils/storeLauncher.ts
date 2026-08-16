// Opening a retailer: try its native app, fall back to the web results page.
//
// This exists as its own unit because the obvious way to write it has a trap in it, and we fell in.
//
// React Native's iOS `canOpenURL` does not simply answer false for a custom scheme it cannot query.
// Read RCTLinkingManager.mm: when the scheme is not http(s), the app cannot open it, AND the scheme
// is absent from `LSApplicationQueriesSchemes`, it calls `reject(...)`. The promise THROWS rather
// than resolving false.
//
// `hktvmall://` was never declared in the Info.plist, so probing it threw every time. The original
// code wrapped the probe and the fallback in one try/catch, so the throw jumped over
// `openURL(webUrl)` straight into the catch and the tap did nothing at all. HKTVmall is the only
// retailer with a native scheme, which is why it was the only broken row: for Wellcome and
// PARKnSHOP the deep link equals the web URL, the probe is skipped, and the web page opens fine.
//
// So the rule this module enforces: a failed PROBE must never cost us the web fallback. The probe is
// only ever an optimisation. The web page is the actual promise we made the user.

/** The slice of expo-linking this needs, narrowed so tests can hand over a fake. */
export interface StoreLinking {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

/**
 * What actually happened, so the caller can tell a real failure from a fallback.
 * - `app`: the retailer's native app opened
 * - `web`: the browser opened, either by choice or because the app was not installed
 * - `failed`: nothing opened, so the caller should say so rather than silently closing
 */
export type StoreOpenOutcome = "app" | "web" | "failed";

/**
 * Open a retailer, preferring its native app.
 *
 * Deliberately structured so each step's failure is contained to that step: probing can fail, the
 * deep link can fail after a successful probe, and in both cases we still try the web page. Only a
 * failed web open counts as a real failure.
 */
export async function openStoreUrl(
  urls: { deepLinkUrl: string; webUrl: string },
  linking: StoreLinking,
): Promise<StoreOpenOutcome> {
  const { deepLinkUrl, webUrl } = urls;

  // A retailer with no native scheme has deepLinkUrl === webUrl, so skip the probe entirely and
  // avoid asking iOS about an http(s) URL it would answer trivially anyway.
  if (deepLinkUrl && deepLinkUrl !== webUrl) {
    try {
      if (await linking.canOpenURL(deepLinkUrl)) {
        await linking.openURL(deepLinkUrl);
        return "app";
      }
    } catch {
      // Undeclared scheme, app not installed, or a malformed link. All of them mean the same thing
      // to us: no native app, use the web. Swallowed HERE and nowhere wider, so the fallback below
      // still runs. This narrow scope is the entire point of the module.
    }
  }

  if (!webUrl) return "failed";

  try {
    await linking.openURL(webUrl);
    return "web";
  } catch {
    return "failed";
  }
}
