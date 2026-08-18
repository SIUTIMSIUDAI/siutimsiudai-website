// The two published /sample/ pages must stay in step with the two bundled fixtures.
//
// AddRecipeSheet offers two demo links. urlScrapeService answers those two exact URLs from
// sampleStructured.ts without touching the network, so the walkthrough works offline. The URLs
// themselves are also real pages on our own site (sample/*/index.html), for two reasons:
//
//   1. A link a user can tap that 404s looks like a broken app, or a made-up URL.
//   2. Those recipes are ours. A live page on our own domain, authored by us, is the evidence.
//
// Which leaves a seam: the fixture and the page are two copies of one recipe, edited separately.
// Change the fixture, forget the page, and the app now shows a dish that the link contradicts.
//
// This test closes that seam by running the real page HTML through the real scraper. It is not a
// spelling check on the markup; it is the same code path a user gets for any spelling of the URL
// that is not the exact demo link (www., http://, a trailing query), which is the one case where
// the page really is fetched and parsed.
//
// The two forms are deliberately not byte-identical, and the assertions say so:
//   - Ingredient lines. The visible list repeats the fixture's rawText ("beef brisket / 牛腩 1 斤")
//     so page and phone read alike; the JSON-LD carries a normalised line ("605 g beef brisket
//     (1 catty · 牛腩)") a schema.org consumer can actually parse. Same ingredient, same order,
//     same count.
//   - Step timers. Our parser reads a duration out of the step's own words, and the fixture's
//     wording carries none, so the parse yields null timers. The instruction TEXT still has to
//     match exactly, and that is what is asserted.

import { readFileSync } from "fs";
import { join } from "path";

import { BRAISED_BEEF, STEAMED_FISH } from "@/services/sampleStructured";
import { parseRecipeFromHtml } from "@/services/urlScrapeService";
import { StructuredRecipe } from "@/types";

const SITE_ROOT = join(__dirname, "..");

function readPage(slug: string): string {
  return readFileSync(join(SITE_ROOT, "sample", slug, "index.html"), "utf8");
}

const PAGES: { slug: string; fixture: StructuredRecipe }[] = [
  { slug: "braised-beef-brisket", fixture: BRAISED_BEEF },
  { slug: "steamed-fish", fixture: STEAMED_FISH },
];

describe("the published /sample/ pages agree with the bundled fixtures", () => {
  for (const { slug, fixture } of PAGES) {
    describe(`/sample/${slug}`, () => {
      const url = `https://siutimsiudai.app/sample/${slug}`;
      const html = readPage(slug);
      const parsed = parseRecipeFromHtml(html, url);

      it("carries a schema.org/Recipe block our own scraper can read", () => {
        // parseRecipeFromHtml throws no_recipe_jsonld / empty_recipe rather than returning a
        // half-built recipe, so reaching here at all is most of the assertion.
        expect(parsed.sourceUrl).toBe(url);
        expect(parsed.ingredients.length).toBeGreaterThan(0);
        expect(parsed.steps.length).toBeGreaterThan(0);
      });

      it("names the same dish, for the same number of people, in the same time", () => {
        expect(parsed.title).toBe(fixture.title);
        expect(parsed.servings).toBe(fixture.servings);
        expect(parsed.totalMinutes).toBe(fixture.totalMinutes);
      });

      it("lists the same ingredients in the same order", () => {
        expect(parsed.ingredients).toHaveLength(fixture.ingredients.length);
        // Wording differs by design; the food does not. Every fixture ingredient's English name
        // should be recognisable in the parsed line at the same position.
        parsed.ingredients.forEach((ing, idx) => {
          expect(ing.name.trim().length).toBeGreaterThan(0);
          const head = fixture.ingredients[idx].name.toLowerCase().split(/\s+/)[0];
          expect(ing.rawText.toLowerCase()).toContain(head);
        });
      });

      it("gives every ingredient a real quantity rather than a bare 0", () => {
        // The scraper falls back to "quantity 0, whole line as the name" when it cannot find a
        // leading amount. That is the right behaviour for "salt to taste" and the wrong outcome
        // for every line on these two pages, so a 0 here means the JSON-LD wording has drifted
        // into a shape the parser no longer understands.
        for (const ing of parsed.ingredients) {
          expect(ing.quantity).toBeGreaterThan(0);
        }
      });

      it("keeps the wet-market original alongside the normalised amount", () => {
        // The bracketed Chinese is what lets a reader check the page against the app. Losing it
        // would not fail any other assertion here.
        const zh = parsed.ingredients.filter((ing) => /[一-鿿]/.test(ing.rawText));
        expect(zh).toHaveLength(fixture.ingredients.length);
      });

      it("spells the method out word for word as the app does", () => {
        expect(parsed.steps.map((s) => s.instruction)).toEqual(
          fixture.steps.map((s) => s.instruction),
        );
      });

      it("shows the Chinese title and every Chinese step somewhere on the page", () => {
        // These are not in the JSON-LD (schema.org has one name, and the scraper seeds titleZh
        // from the English until the app translates it), so they are checked against the rendered
        // markup instead. Without this, the Chinese half of the page could rot unnoticed.
        expect(html).toContain(fixture.titleZh);
        for (const step of fixture.steps) {
          expect(html).toContain(step.instructionZh);
        }
      });

      it("shows each ingredient exactly as the app's recipe card writes it", () => {
        // fixture.rawText is the literal string rendered on the phone. Finding it in the markup is
        // what makes "hold the page next to the app" a fair comparison.
        for (const ing of fixture.ingredients) {
          const [en, zh] = ing.rawText.split(" / ");
          expect(html).toContain(en);
          expect(html).toContain(zh);
        }
      });

      it("credits the app rather than a person, and claims no other publisher's work", () => {
        expect(html).toContain("少甜少底 · Siu Tim Siu Dai");
        expect(html).toMatch(/not reproduced from any other/i);
      });
    });
  }
});
