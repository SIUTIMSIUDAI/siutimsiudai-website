// Where every health number in this app comes from.
//
// App Store Guideline 1.4.1 (Safety - Physical Harm) requires that an app presenting medical or
// health information cites its sources, and that those citations are EASY FOR THE USER TO FIND.
// Version 1.0 (13) was rejected on exactly this: the app computed calorie and nutrient targets and
// recommended ingredient swaps, and the sources were documented only in code comments.
//
// So this registry is the single source of truth, rendered by app/sources.tsx and linked from every
// screen that shows a health number. Rules for anyone editing it:
//
//   1. Every URL must be live, public, and free to read. A reviewer WILL tap them. Do not cite a
//      paywalled paper when the abstract is on PubMed; link the abstract.
//   2. `backs` is not a summary of the source, it is what the source justifies IN THIS APP. That
//      wording is what makes the citation meaningful rather than a decorative link.
//   3. Verify a URL before changing it. The WHO sodium guideline was nearly shipped pointing at
//      "Urban governance for health and well-being" because the ISBN in the path was one digit off.
//
// Last verified live: 2026-11-15. Two links (wei-amdr, zhihu-dris-2023) open only after signing in,
// which rule 1 forbids: they must be replaced before this ships.

export type CitationTopic = "energy" | "macros" | "micros" | "swaps" | "food";

export interface Citation {
  /** Stable id. Used as a React key and in tests; never shown to the user. */
  key: string;
  topic: CitationTopic;
  /** The source's own title, kept in its published language. */
  title: string;
  titleZh: string;
  /** Publishing body, so the user can weigh the authority at a glance. */
  publisher: string;
  publisherZh: string;
  /** What this source justifies in our app, in plain language. */
  backs: string;
  backsZh: string;
  url: string;
  /**
   * Traditional Chinese edition of the same document, where the publisher has one and it has been
   * checked live: today the Centre for Food Safety and Change4Health pages. Leave it out rather than
   * guess. Note the path segments differ per site and are NOT guessable: CFS uses /tc_chi/, but
   * Change4Health uses /tc/ and 404s on /tc_chi/. Verify any change.
   */
  urlZh?: string;
}

/** The URL to open for a citation, preferring the reader's own language. */
export function citationUrl(citation: Citation, locale: string): string {
  return locale === "zh-Hant" && citation.urlZh ? citation.urlZh : citation.url;
}

export const CITATION_TOPICS: { topic: CitationTopic; label: string; labelZh: string }[] = [
  { topic: "energy", label: "Your daily calorie target", labelZh: "你的每日熱量目標" },
  { topic: "macros", label: "Protein, fat, carbs and fibre", labelZh: "蛋白質、脂肪、碳水及纖維" },
  { topic: "micros", label: "Vitamins, minerals and sodium", labelZh: "維他命、礦物質及鈉" },
  { topic: "swaps", label: "Make it healthy suggestions", labelZh: "「食得健康啲」建議" },
  { topic: "food", label: "Food nutrition data", labelZh: "食物營養數據" },
];

export const CITATIONS: Citation[] = [
  {
    key: "mifflin-st-jeor",
    topic: "energy",
    title: "A new predictive equation for resting energy expenditure in healthy individuals",
    titleZh: "健康人士靜息能量消耗的新預測公式",
    publisher: "Mifflin MD, St Jeor ST, et al. American Journal of Clinical Nutrition, 1990",
    publisherZh: "Mifflin MD、St Jeor ST 等，《美國臨床營養學雜誌》，1990",
    backs:
      "The Mifflin-St Jeor equation, which we use to estimate your basal metabolic rate from your age, sex, height and weight. Your daily calorie target is that figure scaled by your activity level, kept within 10% of the Chinese reference energy need where one is confirmed for your age and activity, then adjusted for your weight goal.",
    backsZh:
      "我們用 Mifflin-St Jeor 公式，按你的年齡、性別、身高同體重估算基礎代謝率。再按你的活動量調整；如果中國參考標準有確認你年齡同活動量嘅能量需要量，就保持喺佢嘅 10% 以內；最後按你的體重目標調整，得出每日熱量目標。",
    url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  },
  {
    key: "china-dris-2023",
    topic: "energy",
    title: "Dietary Reference Intakes for China (2023)",
    titleZh: "中國居民膳食營養素參考攝入量（2023版）",
    publisher: "Chinese Nutrition Society",
    publisherZh: "中國營養學會",
    backs:
      "The 2023 Chinese reference behind your targets. The energy check, your protein, fat and carbohydrate ranges, and your calcium, iron, vitamin C and vitamin D amounts all follow this edition.",
    backsZh:
      "你嘅目標所依據嘅 2023 年中國參考標準。熱量核對、蛋白質、脂肪同碳水化合物嘅比例範圍，以及鈣、鐵、維他命C同維他命D嘅份量，都跟呢個版本。",
    url: "https://en.cnsoc.org/DRIs",
  },
  {
    // The page's own title has a Chinese dash after 全民行动; it is shown with a colon instead, because
    // app copy never uses em dashes.
    key: "cqcdc-energy",
    topic: "energy",
    title: "吃动平衡 健康体重 全民行动：请看这里",
    titleZh: "吃动平衡 健康体重 全民行动：请看这里",
    publisher: "Chongqing Center for Disease Control and Prevention",
    publisherZh: "重慶市疾病預防控制中心",
    backs:
      "The 2023 Chinese reference energy needs for adults aged 18 to 49 with light activity. Where your age and activity match, we keep your daily calories within 10% of that figure.",
    backsZh:
      "2023 年中國參考標準中，18 至 49 歲輕度活動成人嘅能量需要量。如果你嘅年齡同活動量符合，我哋會將你每日熱量保持喺呢個數字嘅 10% 以內。",
    url: "https://www.cqcdc.org/index.php?a=shows&catid=252&id=2807",
  },
  {
    // RELEASE BLOCKER: this link asks for a sign-in (checked 2026-11-15), which rule 1 forbids.
    key: "wei-amdr",
    topic: "macros",
    title: "Energy and nutrients intakes among adult residents in Xinjiang, 1982-2015",
    titleZh: "新疆成年居民能量及營養素攝入量（1982-2015）",
    publisher: "Wei X, et al. Wei Sheng Yan Jiu (Journal of Hygiene Research), 2026",
    publisherZh: "Wei X 等，《衞生研究》，2026",
    backs:
      "The 2023 Chinese ranges for protein (10-15% of your daily calories), fat (20-30%) and carbohydrate (50-65%). Your protein target is 15%, fat 27%, and carbohydrate the rest.",
    backsZh:
      "2023 年中國參考標準嘅比例範圍：蛋白質佔每日熱量 10-15%、脂肪 20-30%、碳水化合物 50-65%。你嘅蛋白質目標係 15%，脂肪 27%，其餘係碳水化合物。",
    url: "https://consensus.app/papers/details/w:f9feaaaf-f61f-4e32-92db-463a7c7f3fc6/",
  },
  {
    key: "phc-fibre",
    topic: "macros",
    title: "Life Course Preventive Care for Women: Maintain a Healthy and Balanced Diet",
    titleZh: "女性全生命周期預防保健：保持健康均衡飲食",
    publisher: "Primary Healthcare Commission, Hong Kong SAR Government, 2025",
    publisherZh: "香港特別行政區政府基層醫療署，2025",
    backs: "Your fibre target of 25 g a day.",
    backsZh: "你每日 25 克嘅纖維目標。",
    url: "https://www.healthbureau.gov.hk/phcc/rfs/assets/pdf/women/lifestyle/printing_maintain_a_healthy_and_balanced_diet.pdf",
  },
  {
    key: "cfs-sodium",
    topic: "micros",
    title: "Salt Reduction Together - Bread",
    titleZh: "齊齊減鹽-麵包篇",
    publisher: "Centre for Food Safety, Hong Kong SAR Government",
    publisherZh: "香港特別行政區政府食物安全中心",
    backs:
      "The 2,000 mg daily sodium ceiling (5 g of salt) the World Health Organization recommends. Sodium is the one target in the app you aim to stay under rather than reach.",
    backsZh: "世界衞生組織建議嘅每日 2,000 毫克鈉上限（即 5 克鹽）。鈉係app入面唯一要「唔好超過」而非「要達到」的目標。",
    url: "https://www.cfs.gov.hk/english/programme/programme_rdss/Sodium_Voluntary_Sodium_Reduction_Target.html",
    urlZh: "https://www.cfs.gov.hk/tc_chi/programme/programme_rdss/Sodium_Voluntary_Sodium_Reduction_Target.html",
  },
  {
    key: "dh-potassium",
    topic: "micros",
    title: "DH releases Population Health Survey Report (Part II)",
    titleZh: "衞生署公布人口健康調查報告（第二部分）",
    publisher: "Department of Health, Hong Kong SAR Government, 2023",
    publisherZh: "香港特別行政區政府衞生署，2023",
    backs: "The World Health Organization's recommendation of at least 3.5 g (3,500 mg) of potassium a day, your potassium target.",
    backsZh: "世界衞生組織建議每日最少攝取 3.5 克（3,500 毫克）鉀，即你嘅鉀目標。",
    url: "https://www.info.gov.hk/gia/general/202304/26/P2023042600168.htm",
  },
  {
    key: "tencent-dris-2023",
    topic: "micros",
    title: "【科普营养】主食少吃半碗，老人吃够肉蛋奶……新版《中国居民膳食营养素参考摄入量（2023版）》的变化影响我们餐桌",
    titleZh: "【科普营养】主食少吃半碗，老人吃够肉蛋奶……新版《中国居民膳食营养素参考摄入量（2023版）》的变化影响我们餐桌",
    publisher: "Tencent News, 2024",
    publisherZh: "騰訊新聞，2024",
    backs: "Your calcium target of 800 mg a day, the 2023 figure for all adults.",
    backsZh: "你每日 800 毫克嘅鈣目標，即 2023 年版本俾所有成人嘅數字。",
    url: "https://news.qq.com/rain/a/20241231A01T5800",
  },
  {
    key: "phc-micros",
    topic: "micros",
    title: "Life Course Preventive Care for Women: Maintain a Healthy and Balanced Diet",
    titleZh: "女性全生命周期預防保健：保持健康均衡飲食",
    publisher: "Primary Healthcare Commission, Hong Kong SAR Government, 2025",
    publisherZh: "香港特別行政區政府基層醫療署，2025",
    backs: "The iron amounts for women (18 mg up to age 49, 10 mg from 50) and 10 mcg of vitamin D.",
    backsZh: "女性嘅鐵份量（49 歲或以下 18 毫克，50 歲起 10 毫克），同 10 微克維他命D。",
    url: "https://www.healthbureau.gov.hk/phcc/rfs/assets/pdf/women/lifestyle/printing_maintain_a_healthy_and_balanced_diet.pdf",
  },
  {
    // O12, added 2026-11-15 after the reference doc: it confirms the DRIs 2023 vitamin C figure the doc
    // had tagged unverified. The article's own title has an em dash before "10 PLADs"; it is shown with a
    // colon, because app copy never uses em dashes.
    key: "chinacdc-vitamin-c",
    topic: "micros",
    title: "Dietary Vitamin Intake Among Chinese Adults: 10 PLADs, China, 2022-2023",
    titleZh: "中國成年人膳食維他命攝入量：10 個省級行政區，2022-2023",
    publisher: "Zhang X, et al. China CDC Weekly, 2024",
    publisherZh: "Zhang X 等，《中國疾病預防控制中心周報》，2024",
    backs: "Your vitamin C target of 100 mg a day, the 2023 Chinese recommended intake for adults.",
    backsZh: "你每日 100 毫克嘅維他命C目標，即 2023 年中國參考標準建議成人嘅攝取量。",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11724128/",
  },
  {
    // RELEASE BLOCKER: this link asks for a Zhihu sign-in (checked 2026-11-15), which rule 1 forbids.
    // Its own title couldn't be read for the same reason; this one describes it as the reference doc does.
    key: "zhihu-dris-2023",
    topic: "micros",
    title: "2023 DRIs update explainer",
    titleZh: "2023 版膳食營養素參考攝入量更新解讀",
    publisher: "Zhihu, 2023",
    publisherZh: "知乎，2023",
    backs: "The iron amount for men (12 mg) and 15 mcg of vitamin D from age 65.",
    backsZh: "男性嘅鐵份量（12 毫克），同 65 歲起嘅 15 微克維他命D。",
    url: "https://zhuanlan.zhihu.com/p/659397959",
  },
  {
    key: "who-healthy-diet",
    topic: "swaps",
    title: "Healthy diet",
    titleZh: "健康飲食",
    publisher: "World Health Organization",
    publisherZh: "世界衞生組織",
    backs:
      "The reasoning behind Make it healthy: cutting saturated fat, cutting salt, and choosing wholegrains for more fibre.",
    backsZh: "「食得健康啲」的理據：減飽和脂肪、減鹽、揀全穀類增加纖維。",
    url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
  },
  {
    key: "change4health",
    topic: "swaps",
    title: "Change4Health: Healthy Eating",
    titleZh: "健康飲食　@　「活出健康新方向」",
    publisher: "Department of Health, Hong Kong SAR Government",
    publisherZh: "香港特別行政區政府衞生署",
    backs:
      "Hong Kong dietary guidance, which is why our swaps favour steaming over deep-frying and reduced-sodium versions of local sauces.",
    backsZh: "香港本地飲食指引，所以我們的替換建議偏向蒸多過炸，亦會揀本地醬料的減鈉版本。",
    url: "https://www.change4health.gov.hk/en/healthy_diet/",
    urlZh: "https://www.change4health.gov.hk/tc/healthy_diet/",
  },
  {
    key: "cfs-nutrient",
    topic: "food",
    title: "Nutrient Information Inquiry",
    titleZh: "營養資料查詢",
    publisher: "Centre for Food Safety, Hong Kong SAR Government",
    publisherZh: "香港特別行政區政府食物安全中心",
    backs:
      "Nutrition reference values for local Hong Kong foods and dishes, used to sanity-check the estimates the app produces for cha chaan teng and dai pai dong staples.",
    backsZh: "本地香港食物同菜式的營養參考值，用嚟核對app對茶餐廳同大牌檔常見食物的估算。",
    url: "https://www.cfs.gov.hk/english/nutrient/",
    urlZh: "https://www.cfs.gov.hk/tc_chi/nutrient/",
  },
  {
    key: "open-food-facts",
    topic: "food",
    title: "Open Food Facts",
    titleZh: "Open Food Facts 開放食品資料庫",
    publisher: "Open Food Facts (non-profit, ODbL licence)",
    publisherZh: "Open Food Facts（非牟利，ODbL 授權）",
    backs:
      "Every figure the barcode scanner shows. Scanning a packet looks the code up in this open database and reports what its contributors recorded from the packet's own nutrition label. We estimate nothing here. A barcode nobody has catalogued returns no result, and the app asks you to enter the food by hand instead.",
    backsZh:
      "掃條碼見到嘅所有數字。掃描時會攞條碼去呢個開放資料庫查，顯示貢獻者由包裝營養標籤抄低嘅數值，我哋唔會自己估。如果個條碼未有人收錄，就會搵唔到，app會叫你自己手動輸入。",
    url: "https://world.openfoodfacts.org/",
  },
];

/** Citations for one topic, in registry order. */
export function citationsFor(topic: CitationTopic): Citation[] {
  return CITATIONS.filter((c) => c.topic === topic);
}
