// What a member's "Foods I don't eat" entry stands for when plan-week checks a dish: the second line
// of defence behind the prompt's rule 1. Pure on purpose: no Deno globals and no imports, so the
// app's Jest suite can test it.
//
// Members type free text, in English or Chinese, and a plain substring match missed the obvious: on
// 2026-11-18 both models planned 火腿蛋治 for a family with "pork" excluded. So an entry now stands for:
//  1. the member's own words, and the food read out of "no pork", "唔食豬肉" or "peanut allergy";
//  2. an English plural's singular, as a whole word ("peanuts" catches "peanut oil", while "peas"
//     does not catch "peanut");
//  3. for a common food group, the foods made from it in both languages (GROUPS below);
//  4. with variant characters folded together (葱 and 蔥, 鷄 and 雞).
// It still errs towards dropping a dish, apart from the look-alike words in LOOKALIKES (eggplant is
// not egg, coconut is not a nut), which are left in.

// Variant and simplified characters a cook might type, folded to the form the model writes.
const VARIANTS: Record<string, string> = {
  葱: "蔥", 鷄: "雞", 鸡: "雞", 麪: "麵", 咸: "鹹", 蚝: "蠔", 猪: "豬", 虾: "蝦", 鱼: "魚", 黄: "黃", 姜: "薑",
};
const VARIANT_CHARS = new RegExp(`[${Object.keys(VARIANTS).join("")}]`, "g");

/** Lower-case, with variant characters folded, so a dish and an exclusion compare alike. */
export function foldText(s: string): string {
  return s.toLowerCase().replace(VARIANT_CHARS, (c) => VARIANTS[c]);
}

// Words around the food itself: "no pork", "唔食牛", "peanut allergy", "蝦過敏". Longest first.
const PREFIXES = ["allergic to ", "allergy to ", "avoid ", "not ", "no ", "唔食", "唔吃", "不吃", "不食", "冇", "走", "戒"];
const SUFFIXES = [" intolerance", " intolerant", " allergies", " allergy", "-free", " free", "不耐症", "不耐", "過敏", "敏感"];

function coreOf(term: string): string {
  let t = term;
  const p = PREFIXES.find((x) => t.startsWith(x));
  if (p) t = t.slice(p.length);
  const s = SUFFIXES.find((x) => t.endsWith(x));
  if (s) t = t.slice(0, -s.length);
  return t.trim();
}

/** An English plural's singular ("peanuts" to "peanut"), or the word unchanged. */
function singularOf(t: string): string {
  if (!/^[a-z][a-z' -]*s$/.test(t) || t.endsWith("ss")) return t;
  if (t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes)$/.test(t)) return t.slice(0, -2);
  return t.slice(0, -1);
}

const FISH = [
  "fish", "魚", "salmon", "tuna", "sardine", "anchovy", "anchovies", "mackerel", "basa", "tilapia", "trout",
  "grouper", "sea bass", "pomfret", "halibut", "sole", "carp", "bonito", "unagi",
  "石斑", "龍脷", "鯇", "鯪", "鱸", "鯧", "鰻", "吞拿", "沙甸", "鯷", "鰹",
];
const SHELLFISH = [
  "shellfish", "shrimp", "prawn", "crab", "lobster", "crayfish", "langoustine", "scallop", "clam", "mussel",
  "oyster", "abalone", "whelk", "squid", "calamari", "cuttlefish", "octopus", "XO sauce", "belacan",
  "蝦", "蟹", "帶子", "扇貝", "蜆", "青口", "蠔", "鮑魚", "螺", "蚌", "瑤柱", "干貝", "花甲", "聖子", "蟶子",
  "魷魚", "鮮魷", "墨魚", "八爪魚", "章魚", "XO醬", "馬拉盞",
];
const PEANUT = ["peanut", "groundnut", "satay", "kung pao", "花生", "沙嗲", "宮保"];

export interface Group {
  /** What a member might type for the group (after "no" / "唔食" and plurals are taken off). */
  names: string[];
  /** Everything a dish is checked for when someone excludes the group. */
  covers: string[];
}

// The common exclusions and what each covers (first version 2026-11-18). Widen or trim a group here.
export const GROUPS: ReadonlyArray<Group> = [
  {
    names: ["pork", "pig", "豬", "豬肉"],
    covers: [
      "pork", "豬", "ham", "bacon", "sausage", "frankfurter", "hot dog", "salami", "pepperoni", "chorizo",
      "prosciutto", "pancetta", "lard", "luncheon meat", "spam", "char siu", "cha siu", "spare rib", "sparerib",
      "siu mai", "siu yuk", "wonton", "lap cheong", "tonkotsu",
      "火腿", "煙肉", "培根", "叉燒", "燒肉", "排骨", "香腸", "臘腸", "腸仔", "熱狗", "午餐肉", "餐肉", "豬油",
      "臘肉", "臘味", "鹹肉", "肉鬆", "燒賣", "五花腩", "梅頭", "瘦肉", "餐蛋", "雲吞", "餛飩", "豚",
    ],
  },
  {
    names: ["beef", "cow", "牛", "牛肉"],
    covers: [
      "beef", "brisket", "oxtail", "ox tongue", "veal", "sirloin", "ribeye", "rib eye", "short rib",
      "牛肉", "牛腩", "牛扒", "牛柳", "牛丸", "牛筋", "牛腱", "牛展", "牛尾", "牛舌", "牛脷", "牛柏葉", "牛百葉",
      "牛肚", "牛雜", "牛河", "肥牛", "牛仔骨", "牛小排", "牛骨",
    ],
  },
  { names: ["lamb", "mutton", "羊", "羊肉"], covers: ["lamb", "mutton", "羊"] },
  {
    names: ["chicken", "雞", "雞肉"],
    covers: ["chicken", "雞肉", "雞翼", "雞髀", "雞腿", "雞胸", "雞扒", "雞柳", "雞件", "雞腳", "鳳爪", "雞湯", "雞粉", "雞精", "雞油"],
  },
  { names: ["fish", "魚", "魚類"], covers: FISH },
  {
    names: ["shellfish", "crustacean", "mollusc", "mollusk", "貝類", "甲殼類", "貝殼類", "介殼類"],
    covers: SHELLFISH,
  },
  {
    names: ["shrimp", "prawn", "蝦", "蝦仁"],
    covers: ["shrimp", "prawn", "蝦", "XO sauce", "XO醬", "belacan", "馬拉盞", "wonton", "雲吞"],
  },
  { names: ["crab", "蟹"], covers: ["crab", "蟹"] },
  { names: ["seafood", "sea food", "海鮮", "海產", "海鮮類"], covers: ["seafood", "海鮮", ...FISH, ...SHELLFISH] },
  {
    names: ["egg", "蛋", "雞蛋", "蛋類"],
    covers: ["egg", "蛋", "mayonnaise", "mayo", "omelette", "omelet", "custard", "meringue", "aioli", "frittata", "quiche", "奄列", "沙律醬"],
  },
  {
    names: ["dairy", "dairy product", "milk", "lactose", "奶", "牛奶", "奶類", "乳製品", "奶製品", "乳糖"],
    covers: [
      "milk", "dairy", "cheese", "butter", "cream", "yoghurt", "yogurt", "ghee", "whey", "mozzarella", "parmesan",
      "cheddar", "奶", "芝士", "牛油", "忌廉", "乳酪", "黃油", "起司",
    ],
  },
  { names: ["peanut", "groundnut", "花生", "花生米"], covers: PEANUT },
  {
    names: ["nut", "tree nut", "堅果", "果仁", "硬殼果", "木本堅果"],
    covers: [
      "nut", "almond", "cashew", "pecan", "pistachio", "macadamia", "praline", "marzipan", "ginkgo",
      "杏仁", "腰果", "合桃", "核桃", "碧根果", "開心果", "榛子", "夏威夷果", "松子", "栗子", "果仁", "堅果", "白果",
      ...PEANUT,
    ],
  },
  { names: ["sesame", "芝麻"], covers: ["sesame", "tahini", "芝麻", "麻油", "麻醬"] },
  {
    names: ["soy", "soya", "soybean", "soy bean", "soya bean", "大豆", "黃豆"],
    covers: [
      "soy", "soya", "tofu", "edamame", "miso", "tempeh", "豆腐", "腐竹", "枝竹", "支竹", "豆漿", "豆奶", "黃豆",
      "大豆", "枝豆", "味噌", "豉", "腐乳", "南乳", "生抽", "老抽", "醬油", "豆卜",
    ],
  },
  {
    names: ["alcohol", "wine", "liquor", "酒", "酒精"],
    covers: ["alcohol", "wine", "beer", "brandy", "sake", "mirin", "sherry", "whisky", "whiskey", "vodka", "酒", "花雕", "味醂", "玫瑰露"],
  },
  {
    names: ["spicy", "spicy food", "chilli", "chili", "chillies", "chilies", "辣", "辣椒", "辛辣", "辣嘢"],
    covers: [
      "spicy", "chilli", "chili", "jalapeño", "jalapeno", "sriracha", "cayenne", "gochujang", "kimchi", "tabasco",
      "hot sauce", "sichuan pepper", "szechuan pepper", "辣", "指天椒", "豆瓣醬", "泡椒", "泡菜", "花椒",
    ],
  },
];

// Words that contain a covered word but are not that food. Masked out only while checking that word,
// so someone who excludes coconut itself is still caught by "coconut".
const LOOKALIKES: Record<string, string[]> = {
  egg: ["eggplant"],
  custard: ["custard powder"],
  nut: ["coconut", "nutmeg", "doughnut", "donut", "butternut", "water chestnut"],
  milk: ["coconut milk", "soy milk", "soya milk", "oat milk", "almond milk", "rice milk", "milkfish"],
  butter: ["peanut butter", "nut butter", "almond butter", "cocoa butter", "butternut", "butterfl"],
  cream: ["coconut cream", "cream cracker"],
  奶: ["椰奶", "豆奶", "杏仁奶", "燕麥奶"],
  牛油: ["牛油果"],
  ham: ["hamburger", "hamburg", "graham", "champignon", "hamachi"],
  lard: ["collard"],
  carp: ["carpaccio"],
  fish: ["fish-fragrant", "fish fragrant"],
  魚: ["魚香"],
  羊: ["羊肚菌"],
  螺: ["螺絲", "螺旋"],
  蠔: ["蠔菇"],
  oyster: ["oyster mushroom"],
};

const GROUP_BY_NAME = new Map<string, Group>();
for (const g of GROUPS) for (const n of g.names) GROUP_BY_NAME.set(foldText(n), g);

/** The group an entry names ("唔食豬肉" names pork), if any. */
function groupOf(exclusion: string): Group | undefined {
  const core = coreOf(foldText(exclusion.trim()));
  return GROUP_BY_NAME.get(core) ?? GROUP_BY_NAME.get(singularOf(core));
}

export interface ExclusionTerm {
  text: string;
  /** Match as a whole English word, plural allowed, rather than anywhere in the text. */
  wholeWord: boolean;
}

/** Everything one member's entry is checked for. */
export function exclusionTerms(exclusion: string): ExclusionTerm[] {
  const original = foldText(exclusion.trim());
  if (!original) return [];
  const core = coreOf(original);
  const out = new Map<string, ExclusionTerm>();
  const add = (text: string, wholeWord: boolean) => {
    if (text && !out.has(text)) out.set(text, { text, wholeWord });
  };
  add(original, false);
  add(core, false);
  add(singularOf(core), true);
  for (const w of groupOf(exclusion)?.covers ?? []) add(foldText(w), false);
  return Array.from(out.values());
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether folded text names a term, leaving out the look-alike words that only contain it. */
export function namesTerm(foldedText: string, term: ExclusionTerm): boolean {
  let hay = foldedText;
  for (const lookalike of LOOKALIKES[term.text] ?? []) hay = hay.split(lookalike).join("\n");
  if (!term.wholeWord) return hay.includes(term.text);
  const t = term.text;
  const body = t.endsWith("y") ? `${escapeRe(t.slice(0, -1))}(?:y|ies)` : `${escapeRe(t)}(?:e?s)?`;
  return new RegExp(`(?:^|[^a-z])${body}(?![a-z])`).test(hay);
}

/**
 * What the prompt spells out after an entry: the foods its group covers beyond the group's own
 * names, e.g. "pork" -> ham, bacon, 叉燒 ... Empty for a food with no group.
 */
export function alsoCovers(exclusion: string): string[] {
  const g = groupOf(exclusion);
  if (!g) return [];
  const names = new Set(g.names.map(foldText));
  return Array.from(new Set(g.covers.filter((w) => !names.has(foldText(w)))));
}
