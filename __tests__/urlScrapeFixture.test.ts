// Guard for the bug where the two offline demo chips hijacked two real recipe sites.
//
// AddRecipeSheet offers two sample URLs so the walkthrough works with no network. urlScrapeService
// served those from bundled fixtures — but it matched the DOMAIN (/cookpad/i, /daydaycook/i), not
// the two links. Cookpad and DayDayCook are among the biggest recipe sites in Hong Kong, so the
// most likely URL an HK user would ever paste was also the one guaranteed not to be scraped: any
// cookpad.com page returned the bundled steamed sea bass, stamped with the sourceUrl the user had
// pasted. It looked like the import had worked, and the wrong recipe was saved to their box.
//
// The rule enforced here: exactly two links answer from a fixture. Everything else, including any
// other page on those same domains, goes to the real scraper.

import { urlScrapeService } from "@/services/urlScrapeService";

const DEMO_FISH = "https://cookpad.com/hk/recipes/steamed-fish";
const DEMO_BEEF = "https://daydaycook.com/recipes/braised-beef-brisket";

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

describe("urlScrapeService.scrape — real pages on the demo domains", () => {
  // The bug in one list: each of these is a genuine page a Hong Kong user might paste, and each
  // used to come back as the bundled fixture.
  const realUrls = [
    "https://cookpad.com/hk/recipes/24601-char-siu",
    "https://cookpad.com/hk/search/蘿蔔糕",
    "https://daydaycook.com/recipes/steamed-egg-custard",
    "https://www.daydaycook.com/recipe/12345",
  ];

  for (const url of realUrls) {
    it(`scrapes ${url} for real instead of serving a fixture`, async () => {
      // The scraper is the only path, and here it fails because fetch is stubbed to reject. A
      // failure is the correct outcome: it is honest, and the sheet reports it. Silently returning
      // someone else's recipe is not.
      await expect(urlScrapeService.scrape(url)).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalled();
    });
  }

  it("never returns a fixture title for a real page on a demo domain", async () => {
    // Belt and braces: if a future change reintroduces domain matching, this fails even if the
    // scraper somehow resolves.
    const outcome = await urlScrapeService
      .scrape("https://cookpad.com/hk/recipes/99999-something-else")
      .catch(() => null);

    expect(outcome).toBeNull();
  });
});
