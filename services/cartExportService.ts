import { CartExportPayload, GroceryListItem, GroceryRetailer, StoreAvailability } from "@/types";
import { MOCK_RETAILER_GAPS, RETAILER_ORDER, RETAILERS } from "@/constants/retailers";
import { buildStoreEntryUrl, formatClipboardList, matchAvailabilityFor } from "@/utils/cartExport";
import { delay } from "./util";

export interface CartExportService {
  // Availability of a missing-ingredient list across all three retailers, ordered widest-catalogue
  // first, powering the comparison modal's "4 / 5 items found" rows. Mock now (a deterministic
  // catalogue in constants/retailers.ts); swap for a live product-search API later with no UI or
  // type change.
  checkAvailability(items: GroceryListItem[]): Promise<StoreAvailability[]>;
  // The clipboard text plus open URLs for the retailer the shopper picked. Synchronous: it only
  // formats strings, no network, so the tap-to-export feels instant.
  //
  // The URL is the STORE ENTRY url, not a search for one arbitrary ingredient: a store whose engine
  // can OR several terms gets the whole missing list in one query, and a store whose engine cannot
  // gets its plain storefront, with the per-ingredient searches handled by the checklist afterwards.
  buildExport(retailer: GroceryRetailer, items: GroceryListItem[]): CartExportPayload;
}

export const cartExportService: CartExportService = {
  async checkAvailability(items) {
    await delay(500);
    return RETAILER_ORDER.map<StoreAvailability>((id) => {
      const retailer = RETAILERS[id];
      const matches = matchAvailabilityFor(items, retailer, MOCK_RETAILER_GAPS[id]);
      return {
        retailer: id,
        foundCount: matches.filter((m) => m.available).length,
        totalCount: matches.length,
        matches,
      };
    });
  },

  buildExport(retailer, items) {
    const config = RETAILERS[retailer];
    const { webUrl, deepLinkUrl } = buildStoreEntryUrl(config, items);
    return {
      retailer,
      clipboardText: formatClipboardList(items, config.searchLanguage),
      deepLinkUrl,
      webUrl,
    };
  },
};
