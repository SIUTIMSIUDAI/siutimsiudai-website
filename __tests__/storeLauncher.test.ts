import { openStoreUrl, StoreLinking } from "@/utils/storeLauncher";

// The bug these tests exist for: tapping HKTVmall did nothing at all.
//
// HKTVmall is the only retailer with a native scheme, so it is the only one that gets probed with
// `canOpenURL`. On iOS that call REJECTS (it does not resolve false) when the scheme is missing from
// LSApplicationQueriesSchemes, and the old code shared one try/catch between the probe and the web
// fallback. The throw skipped the fallback and was swallowed, so no store ever opened.

const HKTV = {
  deepLinkUrl: "hktvmall://search?q=Egg",
  webUrl: "https://www.hktvmall.com/hktv/en/search?q=Egg",
};

// Wellcome and PARKnSHOP expose no app scheme, so the service hands back the same URL twice.
const WELLCOME = {
  deepLinkUrl: "https://www.wellcome.com.hk/zh-hk/search?q=雞蛋",
  webUrl: "https://www.wellcome.com.hk/zh-hk/search?q=雞蛋",
};

/** Records what was opened, so each test can assert on the real call, not a spy count. */
function fakeLinking(over: Partial<StoreLinking> = {}) {
  const opened: string[] = [];
  const probed: string[] = [];
  const linking: StoreLinking = {
    canOpenURL: async (url) => {
      probed.push(url);
      return true;
    },
    openURL: async (url) => {
      opened.push(url);
    },
    ...over,
  };
  return { linking, opened, probed };
}

describe("openStoreUrl — the HKTVmall regression", () => {
  it("still opens the web page when iOS REJECTS the scheme probe", async () => {
    // This is the exact failure. RCTLinkingManager.mm calls reject() for a custom scheme that is
    // absent from LSApplicationQueriesSchemes, so the promise throws rather than answering false.
    const { linking, opened } = fakeLinking({
      canOpenURL: async () => {
        throw new Error("Unable to open URL: hktvmall://search?q=Egg. Add hktvmall to LSApplicationQueriesSchemes");
      },
    });

    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("web");
    expect(opened).toEqual([HKTV.webUrl]); // the assertion that was false before the fix
  });

  it("opens the web page when the app is simply not installed", async () => {
    const { linking, opened } = fakeLinking({ canOpenURL: async () => false });
    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("web");
    expect(opened).toEqual([HKTV.webUrl]);
  });

  it("prefers the native app when it is actually there", async () => {
    const { linking, opened, probed } = fakeLinking();
    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("app");
    expect(probed).toEqual([HKTV.deepLinkUrl]);
    expect(opened).toEqual([HKTV.deepLinkUrl]); // and NOT the web URL as well
  });

  it("falls back to web when the probe passes but the deep link then fails to open", async () => {
    // A stale or hijacked scheme can pass canOpenURL and still fail on open. The shopper should get
    // the web page rather than nothing.
    const { linking, opened } = fakeLinking({
      openURL: async (url) => {
        if (url.startsWith("hktvmall://")) throw new Error("no handler");
      },
    });
    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("web");
    expect(opened).toEqual([]); // the throwing deep link recorded nothing
  });
});

describe("openStoreUrl — retailers with no native app", () => {
  it("skips the probe entirely and opens the web page", async () => {
    const { linking, opened, probed } = fakeLinking();
    await expect(openStoreUrl(WELLCOME, linking)).resolves.toBe("web");
    expect(probed).toEqual([]); // never ask iOS about an http URL
    expect(opened).toEqual([WELLCOME.webUrl]);
  });

  it("opens the web page exactly once, not twice", async () => {
    const { linking, opened } = fakeLinking();
    await openStoreUrl(WELLCOME, linking);
    expect(opened).toHaveLength(1);
  });
});

describe("openStoreUrl — real failure is reported, not hidden", () => {
  it("returns failed when even the web page will not open", async () => {
    const { linking } = fakeLinking({
      canOpenURL: async () => false,
      openURL: async () => {
        throw new Error("no browser");
      },
    });
    // The caller uses this to keep the sheet open and explain itself, instead of closing silently.
    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("failed");
  });

  it("returns failed rather than throwing when there is no web URL to fall back to", async () => {
    const { linking, opened } = fakeLinking({ canOpenURL: async () => false });
    await expect(openStoreUrl({ deepLinkUrl: "x://y", webUrl: "" }, linking)).resolves.toBe("failed");
    expect(opened).toEqual([]);
  });

  it("never rejects, whatever linking throws, since it runs inside a tap handler", async () => {
    const { linking } = fakeLinking({
      canOpenURL: async () => {
        throw new Error("boom");
      },
      openURL: async () => {
        throw new Error("boom");
      },
    });
    await expect(openStoreUrl(HKTV, linking)).resolves.toBe("failed");
  });
});
