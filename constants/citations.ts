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
// Last verified live: 2026-08-04.

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
   * Traditional Chinese edition of the same document, where the publisher has one. Only the two
   * Hong Kong government sources do; PubMed, NIH and ODPHP publish in English only, and WHO's
   * Chinese coverage is inconsistent enough that pointing at it risks a dead link later.
   * Note the path segments differ per site and are NOT guessable: CFS uses /tc_chi/, but
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
      "The Mifflin-St Jeor equation, which we use to estimate your basal metabolic rate from your age, sex, height and weight. Your daily calorie target is that figure scaled by your activity level and your weight goal.",
    backsZh:
      "我們用 Mifflin-St Jeor 公式，按你的年齡、性別、身高同體重估算基礎代謝率。再按你的活動量同體重目標調整，得出每日熱量目標。",
    url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  },
  {
    key: "issn-protein",
    topic: "macros",
    title: "International Society of Sports Nutrition Position Stand: protein and exercise",
    titleZh: "國際運動營養學會立場聲明：蛋白質與運動",
    publisher: "Jäger R, et al. Journal of the International Society of Sports Nutrition, 2017",
    publisherZh: "Jäger R 等，《國際運動營養學會期刊》，2017",
    backs:
      "Your protein target, set between 1.2 g and 2.0 g per kilogram of body weight and rising with your activity level.",
    backsZh: "你的蛋白質目標，按活動量由每公斤體重 1.2 克遞增至 2.0 克。",
    url: "https://pubmed.ncbi.nlm.nih.gov/28642676/",
  },
  {
    key: "dietary-guidelines",
    topic: "macros",
    title: "Dietary Guidelines for Americans",
    titleZh: "美國膳食指南",
    publisher: "Office of Disease Prevention and Health Promotion, U.S. Department of Health and Human Services",
    publisherZh: "美國衞生及公共服務部　疾病預防及健康促進辦公室",
    backs:
      "Your fat target, set at about 27% of energy, the middle of the recommended 20-35% range. Also your fibre target of 14 g per 1,000 kcal.",
    backsZh:
      "你的脂肪目標定於約佔熱量 27%，即建議範圍 20-35% 的中間值。纖維目標亦按每 1,000 千卡 14 克計算。",
    url: "https://odphp.health.gov/our-work/nutrition-physical-activity/dietary-guidelines",
  },
  {
    key: "nih-ods",
    topic: "micros",
    title: "Dietary Supplement Fact Sheets",
    titleZh: "膳食營養素資料庫",
    publisher: "Office of Dietary Supplements, U.S. National Institutes of Health",
    publisherZh: "美國國家衞生研究院　膳食補充劑辦公室",
    backs:
      "The recommended daily amounts we show for calcium, iron, potassium, vitamin C and vitamin D, which vary by your sex and age.",
    backsZh: "我們顯示的鈣、鐵、鉀、維他命C同維他命D每日建議攝取量，會按你的性別同年齡而不同。",
    url: "https://ods.od.nih.gov/factsheets/list-all/",
  },
  {
    key: "who-sodium",
    topic: "micros",
    title: "Guideline: sodium intake for adults and children",
    titleZh: "指引：成人及兒童鈉攝取量",
    publisher: "World Health Organization",
    publisherZh: "世界衞生組織",
    backs:
      "The 2,000 mg daily sodium ceiling. Sodium is the one target in the app you aim to stay under rather than reach.",
    backsZh: "每日 2,000 毫克鈉上限。鈉係app入面唯一要「唔好超過」而非「要達到」的目標。",
    url: "https://www.who.int/publications/i/item/9789241504836",
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
