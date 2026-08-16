import { GroceryRetailer } from "@/types";

export type SearchLanguage = "en" | "zh";

export interface RetailerConfig {
  id: GroceryRetailer;
  name: string;
  nameZh: string;
  // Which name field we search this store with. HKTVmall's catalogue is indexed in English; the
  // two local supermarket chains match far better on Traditional Chinese SKU names, so we hand
  // them nameZh. This is the whole of the "language rule" as data.
  searchLanguage: SearchLanguage;
  brandColor: string; // drives the store row accent in the comparison modal
  // The https search-results URL. {q} is replaced with the URL-encoded first missing item, so the
  // shopper lands on real results for the thing they are short of.
  //
  // These are UNIVERSAL LINKS, and that is the whole trick: where the retailer's app declares the
  // path in its apple-app-site-association file, iOS hands this https URL straight to the installed
  // app, so the tap opens HKTVmall itself on the search results rather than Safari. No custom URL
  // scheme, no canOpenURL probe, no guessing. Where the app does not declare the path, the very
  // same URL opens in the browser on the very same results. One URL, best available outcome.
  //
  // Every template below was read off the retailer's own live search form or verified against a
  // live results page. Do not "tidy" a parameter name: all three sites use a different one
  // (keyword / keyword / text) and every one of them 404s or errors on the obvious `?q=`.
  webSearchTemplate: string;
  // Whether this store's search engine handles SEVERAL ingredients in one query. Tested, not
  // assumed, because the two engines behave in opposite ways:
  //
  //   HKTVmall  `keyword=雞蛋 老抽` -> 200, title "雞蛋 老抽 | HKTVmall", both products on the page.
  //             It ORs the terms and ranks, so one URL can carry the entire missing list.
  //   Wellcome  the same trick fails, and fails quietly: the page still returns 200, but it reads
  //             「很抱歉，沒有找到 "雞蛋 老抽" 商品，為您推薦其他的商品：」 and then fills the screen
  //             with unrelated recommendations. It matches the whole string as one phrase.
  //
  // A store that cannot combine gets one ingredient per search, worked through the checklist.
  // PARKnSHOP is false because it is untested, not because it is known to fail: their edge blocks
  // us outright, and quietly shipping a search that finds nothing is the worse mistake.
  supportsMultiTermSearch: boolean;
  // The plain storefront, opened instead of a search where we cannot combine terms. Chosen to hit
  // the retailer's own app: each of these paths is declared in their apple-app-site-association, so
  // the tap opens the native store rather than a browser tab. Match the declared path EXACTLY,
  // trailing slash included or omitted as listed, or iOS falls through to Safari.
  homeUrl: string;
  // Legacy custom-scheme deep link (e.g. `foo://search?q=`), attempted before the web URL and
  // guarded by Linking.canOpenURL at the call site. Deliberately unset for all three retailers:
  // universal links do this job properly, and the one scheme we tried opened the real app onto an
  // error screen. Kept on the type only because a retailer may one day publish a documented scheme.
  appSearchTemplate?: string;
}

// Fixed display order for the comparison modal (widest catalogue first).
export const RETAILER_ORDER: GroceryRetailer[] = ["hktvmall", "wellcome", "parknshop"];

export const RETAILERS: Record<GroceryRetailer, RetailerConfig> = {
  hktvmall: {
    id: "hktvmall",
    name: "HKTVmall",
    nameZh: "HKTVmall",
    searchLanguage: "en",
    brandColor: "#00A040",
    // Read straight off HKTVmall's own header search form:
    //   <form name="search_form" method="get" action="/hktv/en/search_a/">
    //     <input name="keyword" placeholder="搜尋商店、品牌或商品">
    // The path is `search_a/`, not `search`, and the parameter is `keyword`, not `q`. Verified live,
    // both locales: HTTP 200 with the term rendered into the page title ("egg | HKTVmall The Largest
    // HK Shopping Platform"). `?q=` never returned results, which is exactly why this button used to
    // dump people on an unrelated category page.
    webSearchTemplate: "https://www.hktvmall.com/hktv/en/search_a/?keyword={q}",
    supportsMultiTermSearch: true, // verified: one URL can carry the whole missing list
    homeUrl: "https://www.hktvmall.com/", // covered by { "/": "*" }, so it opens the app
    // No appSearchTemplate, and none is wanted. HKTVmall's apple-app-site-association declares
    // { "/": "*" } for com.hktv.ios.hktvmall, so the app claims EVERY path on this domain and iOS
    // opens the URL above inside the HKTVmall app, already on the results. Their lite app spells it
    // out further with `*/search_a*`. The old `hktvmall://search?q=` guess is what produced
    // 發生不明錯誤: the scheme was real, that route was not. The universal link replaces it.
  },
  wellcome: {
    id: "wellcome",
    name: "Wellcome",
    nameZh: "惠康",
    searchLanguage: "zh",
    brandColor: "#E2231A",
    // Verified live: 200, page title 搜索結果, the term echoed through the results. The previous
    // `/zh-hk/search?q=` was a 404, and not by a detail: the whole `/zh-hk/` prefix does not exist
    // on this domain. The locale segment is `/zh-hant/` and the parameter is `keyword`, not `q`.
    //
    // Browser, not app, and again their call: com.rtahk.wellcome claims `/*/p/*`, `/*/category/*`,
    // cart and account paths, but nothing under search.
    webSearchTemplate: "https://www.wellcome.com.hk/zh-hant/wellcome/search?keyword={q}",
    supportsMultiTermSearch: false, // verified broken: 很抱歉，沒有找到 for any two-term query
    // Bare `/` is the one path com.rtahk.wellcome claims outright, so this opens the Wellcome app.
    // The `/zh-hant/wellcome` storefront does NOT match any declared path and would land in Safari.
    homeUrl: "https://www.wellcome.com.hk/",
  },
  parknshop: {
    id: "parknshop",
    name: "PARKnSHOP",
    nameZh: "百佳",
    searchLanguage: "zh",
    brandColor: "#F26521",
    // `text=`, a third spelling again. Taken from PARKnSHOP's own indexed results pages, e.g.
    // `/zh-hk/search?text=%E7%94%9C%E6%A4%92` titled "搜尋結果: 甜椒 | 百佳網店". `?q=` errors out.
    //
    // This one opens in the browser, not the app, and that is PARKnSHOP's decision rather than ours:
    // their apple-app-site-association lists product (`/*/p/*`), category (`/*/c/*`), brand, orders
    // and store-finder paths, but no search path at all, so iOS has nothing to hand the app. A
    // results page in Safari still beats the app's home screen with nothing typed into it.
    webSearchTemplate: "https://www.parknshop.com/zh-hk/search?text={q}",
    supportsMultiTermSearch: false, // untested (their edge blocks us), so assume the safe answer
    // `/zh-hk` with NO trailing slash: that is the literal path in their association file, and
    // `/zh-hk/` would not match it. Getting this exactly right is what opens the PARKnSHOP app
    // instead of Safari, which is the one thing their missing search path costs us back.
    homeUrl: "https://www.parknshop.com/zh-hk",
  },
};

// Canonical ingredient keys each retailer does NOT stock in our mock catalogue. HKTVmall is the
// online megastore (no gaps); the supermarket chains miss a few specialty items, which is exactly
// what gives the comparison modal something to compare. Deterministic on purpose so the numbers
// are stable across renders and unit-testable. Swap this for a live product-search API behind
// cartExportService and neither the types nor the UI change.
export const MOCK_RETAILER_GAPS: Record<GroceryRetailer, string[]> = {
  hktvmall: [],
  wellcome: ["shaoxing wine"],
  parknshop: ["dark soy sauce"],
};
