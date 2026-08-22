import { CartExportPayload, GroceryListItem, GroceryRetailer } from "@/types";
import { RETAILERS } from "@/constants/retailers";
import { buildStoreEntryUrl, formatClipboardList } from "@/utils/cartExport";

export interface CartExportService {
  // The clipboard text plus open URLs for the retailer the shopper picked. Synchronous: it only
  // formats strings, no network, so the tap-to-export feels instant.
  //
  // The URL is the STORE ENTRY url, not a search for one arbitrary ingredient: a store whose engine
  // can OR several terms gets the whole missing list in one query, and a store whose engine cannot
  // gets its plain storefront, with the per-ingredient searches handled by the checklist afterwards.
  buildExport(retailer: GroceryRetailer, items: GroceryListItem[]): CartExportPayload;
}

export const cartExportService: CartExportService = {
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
