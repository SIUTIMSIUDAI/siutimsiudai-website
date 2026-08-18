// Guard for the bug where the offline demo chips hijacked real recipe sites.
//
// AddRecipeSheet offers two sample URLs so the walkthrough works with no network. urlScrapeService
// serves those from bundled fixtures — but it used to match the DOMAIN, not the exact link, and the
// domains it matched belonged to two of the largest recipe sites in Hong Kong. So the most likely
// URL an HK user would ever paste was also the one guaranteed not to be scraped: any page on those
// sites returned our bundled steamed sea bass, stamped with the sourceUrl the user had pasted. It
// looked like the import had worked, and the wrong recipe was saved to their box.
//
// Two rules are enforced here:
//   1. Exactly two links answer from a fixture. Everything else goes to the real scraper.
//   2. That includes other pages on our OWN domain. Now that the demo links live on
//      siutimsiudai.app, /siutimsiudai\.app/ is the new tempting shortcut, and it is the same bug.

import { urlScrapeService } from "@/services/urlScrapeService";

const DEMO_FISH = "https://siutimsiudai.app/sample/steamed-fish";
const DEMO_BEEF = "https://siutimsiudai.app/sample/braised-beef-brisket";

const realFetch = global.fetch;

beforeEach(() => {
  // Every scrape attempt fails, so "did it reach the network?" is observable as a rejection.
  global.fetch = jest.fn().mockRejectedValue(new Error("network disabled in tests"));
});

afterEach(() => {
  global.fetch = realFetch;
});

describe("urlScrapeService.scrape — the demo chips", () => {
  it("serves the steamed fish fixture for its exact demo link, without a network call", async () => {
    const recipe = await urlScrapeService.scrape(DEMO_FISH);

    expect(recipe.title).toBe("Steamed Sea Bass");
    expect(recipe.titleZh).toBe("清蒸鱸魚");
    expect(recipe.sourceUrl).toBe(DEMO_FISH);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("serves the braised beef fixture for its exact demo link", async () => {
    const recipe = await urlScrapeService.scrape(DEMO_BEEF);

    expect(recipe.title).toBe("Braised Beef Brisket with Radish");
    expect(recipe.titleZh).toBe("蘿蔔炆牛腩");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("tolerates a trailing slash and surrounding whitespace on a demo link", async () => {
    const recipe = await urlScrapeService.scrape(`  ${DEMO_FISH}/  `);

    expect(recipe.title).toBe("Steamed Sea Bass");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("urlScrapeService.scrape — everything that is not a demo link", () => {
  // Each of these is a page a real user might paste, and under domain matching each would have
  // come back as a bundled fixture. The last two are on our own domain: that is the live risk now.
  const realUrls = [
    "https://recipes.example.com/hk/recipes/24601-char-siu",
    "https://recipes.example.com/hk/search/蘿蔔糕",
    "https://another-cookbook.example.org/recipes/steamed-egg-custard",
    "https://siutimsiudai.app/sample/something-else",
    "https://siutimsiudai.app/blog/how-to-braise",
  ];

  for (const url of realUrls) {
    it(`scrapes ${url} for real instead of serving a fixture`, async () => {
      // The scraper is the only path, and here it fails because fetch is stubbed to reject. A
      // failure is the correct outcome: it is honest, and the sheet reports it. Silently returning
      // a recipe the user did not ask for is not.
      await expect(urlScrapeService.scrape(url)).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalled();
    });
  }

  it("never returns a fixture title for a non-demo page on our own domain", async () => {
    // Belt and braces: if a future change reintroduces domain matching, this fails even if the
    // scraper somehow resolves.
    const outcome = await urlScrapeService
      .scrape("https://siutimsiudai.app/sample/99999-something-else")
      .catch(() => null);

    expect(outcome).toBeNull();
  });
});
