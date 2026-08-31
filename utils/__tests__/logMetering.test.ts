import { isMeteredLogSource } from "../logMetering";
import { LogSource } from "@/types";

// Which logging paths cost a free user one weekly AI credit. The product decision: only photo
// recognition is metered (its per-call Google vision cost is the Pro upsell). Typing, voice and
// barcode are always free, with a per-user daily server cap as the abuse backstop.
describe("isMeteredLogSource", () => {
  it("meters photo recognition", () => {
    expect(isMeteredLogSource("photo")).toBe(true);
  });

  it("never meters typing, voice, barcode or label scans", () => {
    const free: LogSource[] = ["voice", "manual", "barcode", "label"];
    for (const source of free) {
      expect(isMeteredLogSource(source)).toBe(false);
    }
  });
});
