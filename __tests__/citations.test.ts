import {
  CITATIONS,
  CITATION_TOPICS,
  citationUrl,
  citationsFor,
  type CitationTopic,
} from "@/constants/citations";
import { isAtTarget } from "@/utils/authGate";

// The citation registry is what answers App Store Guideline 1.4.1: every health figure the app
// shows must name its source, and the user must be able to find it. Version 1.0 (13) was rejected
// for having none. These tests guard the ways that fix can silently rot:
//
//   - a citation loses its Chinese copy, so a zh-Hant reviewer sees an English-only wall
//   - a topic header exists with nothing under it, or citations hide under a topic with no header
//   - a URL is edited to something that is not a live public link
//   - the route gate stops letting /sources open from profile setup
//
// What they cannot check is that a URL still RESOLVES. That needs the network, so it stays a manual
// step: re-verify every link before each submission and update the date in the file header.

describe("citation registry — completeness", () => {
  it("has at least one citation", () => {
    expect(CITATIONS.length).toBeGreaterThan(0);
  });

  it("gives every citation a unique key", () => {
    const keys = CITATIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(CITATIONS.map((c) => [c.key, c] as const))(
    "%s has both languages filled for every user-visible field",
    (_key, citation) => {
      // `backs` is the one that matters most: it is what turns a link into a citation by saying
      // what the source justifies IN THIS APP. An empty one renders as a bare decorative link.
      const pairs = [
        [citation.title, citation.titleZh],
        [citation.publisher, citation.publisherZh],
        [citation.backs, citation.backsZh],
      ];
      for (const [en, zh] of pairs) {
        expect(en.trim().length).toBeGreaterThan(0);
        expect(zh.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(CITATIONS.map((c) => [c.key, c] as const))(
    "%s points at an https URL",
    (_key, citation) => {
      // Plain http would be blocked by App Transport Security and open to a blank page.
      expect(citation.url).toMatch(/^https:\/\//);
      if (citation.urlZh) expect(citation.urlZh).toMatch(/^https:\/\//);
    },
  );

  it("has no placeholder or example URLs", () => {
    for (const citation of CITATIONS) {
      expect(citation.url).not.toMatch(/example\.com|localhost|TODO/i);
    }
  });
});

describe("citation registry — topic grouping", () => {
  it("renders every citation under a topic header", () => {
    // app/sources.tsx walks CITATION_TOPICS and filters CITATIONS by topic. A citation whose topic
    // has no header entry is in the registry but invisible on the screen, which is the one failure
    // mode that looks fine in code review and still fails review at Apple.
    const headed = new Set(CITATION_TOPICS.map((t) => t.topic));
    for (const citation of CITATIONS) {
      expect(headed.has(citation.topic)).toBe(true);
    }
  });

  it("has no empty topic headers", () => {
    for (const { topic } of CITATION_TOPICS) {
      expect(citationsFor(topic).length).toBeGreaterThan(0);
    }
  });

  it("labels every topic in both languages", () => {
    for (const { label, labelZh } of CITATION_TOPICS) {
      expect(label.trim().length).toBeGreaterThan(0);
      expect(labelZh.trim().length).toBeGreaterThan(0);
    }
  });

  it("cites the calorie target, the macros and the swaps specifically", () => {
    // The three claims the rejection called out. Losing any one of them is the regression that
    // costs another review cycle, so they are named rather than counted.
    const required: CitationTopic[] = ["energy", "macros", "swaps"];
    for (const topic of required) {
      expect(citationsFor(topic).length).toBeGreaterThan(0);
    }
  });

  it("keeps citationsFor in registry order", () => {
    const macros = citationsFor("macros").map((c) => c.key);
    expect(macros).toEqual(CITATIONS.filter((c) => c.topic === "macros").map((c) => c.key));
  });
});

describe("citationUrl", () => {
  const withZh = CITATIONS.find((c) => c.urlZh)!;
  const withoutZh = CITATIONS.find((c) => !c.urlZh)!;

  it("prefers the Chinese edition for a zh-Hant reader", () => {
    expect(citationUrl(withZh, "zh-Hant")).toBe(withZh.urlZh);
  });

  it("uses the English edition for an English reader", () => {
    expect(citationUrl(withZh, "en")).toBe(withZh.url);
  });

  it("falls back to the default URL when the publisher has no Chinese edition", () => {
    // PubMed, NIH and ODPHP publish in English only. A zh-Hant reader gets the English page rather
    // than a guessed /tc_chi/ path that 404s, which is exactly how the Change4Health link broke.
    expect(citationUrl(withoutZh, "zh-Hant")).toBe(withoutZh.url);
  });
});

describe("reachability from the launch flow", () => {
  it("lets /sources stay open when pushed from profile setup", () => {
    // Profile setup is the first screen to turn body metrics into a calorie target, so it links
    // here — but the user has no saved profile yet, so the gate still wants them on /profile-setup.
    // Without the satellite entry the citations screen would open and be replaced in one frame.
    expect(isAtTarget("/profile-setup", ["sources"])).toBe(true);
  });

  it("still sends an unprofiled user on any other screen back to profile setup", () => {
    expect(isAtTarget("/profile-setup", ["subscription"])).toBe(false);
  });
});
