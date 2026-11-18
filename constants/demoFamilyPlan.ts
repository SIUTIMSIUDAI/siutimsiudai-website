import type { MealType } from "@/types";
import type {
  IngredientCategory,
  MyPlanSettings,
  PlanDish,
  PlanIngredient,
  PlanMember,
  PlanStep,
  WeekPlan,
} from "@/types/familyPlan";
import { DEMO_DISH_WORDS, DEMO_INGREDIENT_WORDS } from "./demoFamilyPlanTranslations";

// The family plan's demo stand-in, reachable only when Supabase is unconfigured (web preview, tests;
// see services/familyPlanService.ts). Never a fallback for a live failure. Three family members on
// three sizes plus Maria, the family's helper, and a library of everyday Hong Kong home dishes, one
// standard adult serving each, with estimated nutrition and demo Filipino and Indonesian words.

export const DEMO_MY_USER_ID = "demo-me";
export const DEMO_HELPER_ID = "demo-maria";

// Family members' diaries are open to the planner, as family linking has always worked; only the
// helper's is private.
const family = { isHelper: false, helperLanguage: "en" as const, sharesLog: true };

export const DEMO_MEMBERS: PlanMember[] = [
  { userId: DEMO_MY_USER_ID, role: "manager", displayName: "Ka Yan", defaultSize: "medium", ...family },
  { userId: "demo-chi-keung", role: "dependent", displayName: "Chi Keung", defaultSize: "large", ...family },
  { userId: "demo-hoi-ching", role: "dependent", displayName: "Hoi Ching", defaultSize: "small", ...family },
  { userId: DEMO_HELPER_ID, role: "dependent", displayName: "Maria", defaultSize: "medium", isHelper: true, helperLanguage: "fil", sharesLog: false },
];

export const DEMO_ME: MyPlanSettings = { defaultSize: "medium", exclusions: [], ...family };
export const DEMO_HELPER_ME: MyPlanSettings = {
  defaultSize: "medium",
  exclusions: [],
  isHelper: true,
  helperLanguage: "fil",
  sharesLog: false,
};

/** What the rest of the demo family listed. Shown to nobody; the demo planner just avoids it. */
export const DEMO_FAMILY_EXCLUSIONS = ["beef"];

interface DemoDish {
  kind: "breakfast" | "main" | "snack";
  title: string;
  titleZh: string;
  totalMinutes: number;
  ingredients: PlanIngredient[];
  steps: Array<Omit<PlanStep, "stepNumber">>;
  perServing: PlanDish["perServing"];
}

const ing = (name: string, nameZh: string, quantity: number, unit: PlanIngredient["unit"], category: IngredientCategory) => ({
  name,
  nameZh,
  quantity,
  unit,
  category,
});
const step = (instruction: string, instructionZh: string, minutes?: number) => ({
  instruction,
  instructionZh,
  durationSeconds: minutes ? minutes * 60 : null,
});
const RICE = ing("Rice", "白米", 80, "g", "dry_goods");
const kcal = (calories: number, protein: number, carbs: number, fat: number, fiber: number) => ({
  calories,
  protein,
  carbs,
  fat,
  fiber,
});

export const DEMO_DISHES: DemoDish[] = [
  {
    kind: "breakfast",
    title: "Macaroni soup with ham and egg",
    titleZh: "火腿通粉",
    totalMinutes: 15,
    ingredients: [
      ing("Macaroni", "通粉", 70, "g", "dry_goods"),
      ing("Ham", "火腿", 40, "g", "meat"),
      ing("Egg", "雞蛋", 1, "piece", "eggs_dairy_soy"),
      ing("Chicken stock", "雞湯", 300, "ml", "dry_goods"),
    ],
    steps: [
      step("Boil the macaroni until soft, then drain.", "通粉煮至軟身，隔水。", 8),
      step("Heat the stock, add the ham and macaroni.", "雞湯煮滾，加入火腿同通粉。", 3),
      step("Fry an egg and put it on top.", "煎隻蛋放面。", 3),
    ],
    perServing: kcal(430, 21, 55, 13, 2),
  },
  {
    kind: "breakfast",
    title: "Congee with century egg and lean pork",
    titleZh: "皮蛋瘦肉粥",
    totalMinutes: 45,
    ingredients: [
      ing("Rice", "白米", 50, "g", "dry_goods"),
      ing("Lean pork", "瘦肉", 60, "g", "meat"),
      ing("Century egg", "皮蛋", 1, "piece", "eggs_dairy_soy"),
      ing("Ginger", "薑", 5, "g", "produce"),
      ing("Spring onion", "葱", 10, "g", "produce"),
    ],
    steps: [
      step("Simmer the rice in plenty of water until it breaks down.", "白米加大量水煲至綿。", 35),
      step("Add the sliced pork, diced century egg and ginger.", "加入瘦肉片、皮蛋粒同薑絲。", 8),
      step("Top with chopped spring onion.", "灑上葱花。"),
    ],
    perServing: kcal(300, 19, 40, 7, 1),
  },
  {
    kind: "breakfast",
    title: "Scrambled eggs on toast",
    titleZh: "炒蛋多士",
    totalMinutes: 10,
    ingredients: [
      ing("Bread", "方包", 2, "piece", "dry_goods"),
      ing("Egg", "雞蛋", 2, "piece", "eggs_dairy_soy"),
      ing("Milk", "牛奶", 30, "ml", "eggs_dairy_soy"),
      ing("Butter", "牛油", 5, "g", "eggs_dairy_soy"),
    ],
    steps: [
      step("Beat the eggs with the milk.", "雞蛋加牛奶打勻。"),
      step("Scramble gently in the butter over low heat.", "細火用牛油慢慢炒蛋。", 3),
      step("Serve on toast.", "放喺多士上面。"),
    ],
    perServing: kcal(380, 18, 32, 19, 2),
  },
  {
    kind: "breakfast",
    title: "Oat porridge with banana",
    titleZh: "香蕉燕麥粥",
    totalMinutes: 10,
    ingredients: [
      ing("Rolled oats", "燕麥", 50, "g", "dry_goods"),
      ing("Milk", "牛奶", 200, "ml", "eggs_dairy_soy"),
      ing("Banana", "香蕉", 1, "piece", "produce"),
    ],
    steps: [
      step("Simmer the oats in the milk, stirring.", "燕麥加牛奶慢火煮，邊煮邊攪。", 5),
      step("Slice the banana on top.", "香蕉切片放面。"),
    ],
    perServing: kcal(390, 14, 63, 9, 6),
  },
  {
    kind: "breakfast",
    title: "Pan-fried turnip cake with soy milk",
    titleZh: "煎蘿蔔糕配豆漿",
    totalMinutes: 15,
    ingredients: [
      ing("Turnip cake", "蘿蔔糕", 150, "g", "other"),
      ing("Soy milk", "豆漿", 250, "ml", "eggs_dairy_soy"),
    ],
    steps: [
      step("Slice the turnip cake and pan-fry until golden on both sides.", "蘿蔔糕切件，煎至兩面金黃。", 8),
      step("Warm the soy milk.", "豆漿翻熱。", 2),
    ],
    perServing: kcal(380, 12, 52, 13, 3),
  },
  {
    kind: "main",
    title: "Soy sauce chicken with rice",
    titleZh: "豉油雞飯",
    totalMinutes: 40,
    ingredients: [
      ing("Chicken", "雞肉", 200, "g", "meat"),
      ing("Dark soy sauce", "老抽", 8, "ml", "dry_goods"),
      ing("Soy sauce", "豉油", 8, "ml", "dry_goods"),
      ing("Rock sugar", "冰糖", 5, "g", "dry_goods"),
      ing("Ginger", "薑", 10, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Cook the rice.", "煲飯。", 25),
      step("Bring the soy sauces, rock sugar, ginger and a cup of water to the boil.", "老抽、豉油、冰糖、薑同一杯水煮滾。", 3),
      step("Poach the chicken in it on a low heat, turning once, then chop.", "放雞落去慢火浸熟，中途反一次，斬件。", 25),
    ],
    perServing: kcal(590, 36, 71, 16, 1),
  },
  {
    kind: "main",
    title: "Tomato and egg stir-fry with rice",
    titleZh: "番茄炒蛋飯",
    totalMinutes: 15,
    ingredients: [
      ing("Egg", "雞蛋", 2, "piece", "eggs_dairy_soy"),
      ing("Tomato", "番茄", 150, "g", "produce"),
      ing("Sugar", "糖", 3, "g", "dry_goods"),
      ing("Spring onion", "葱", 10, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Scramble the eggs until just set and set aside.", "雞蛋炒至半熟，盛起。", 2),
      step("Stir-fry the tomato wedges with the sugar until saucy.", "番茄件加糖炒至出汁。", 4),
      step("Return the eggs, add spring onion and serve on rice.", "回鑊加蛋同葱，放喺飯面。", 1),
    ],
    perServing: kcal(520, 19, 74, 15, 3),
  },
  {
    kind: "main",
    title: "Steamed sea bass with ginger and spring onion, rice",
    titleZh: "薑葱蒸鱸魚飯",
    totalMinutes: 25,
    ingredients: [
      ing("Sea bass", "鱸魚", 180, "g", "seafood"),
      ing("Ginger", "薑", 10, "g", "produce"),
      ing("Spring onion", "葱", 20, "g", "produce"),
      ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Lay the fish on ginger slices and steam.", "魚放薑片上面蒸。", 8),
      step("Top with spring onion, then pour over hot oil and soy sauce.", "放葱絲，淋熱油同豉油。"),
    ],
    perServing: kcal(480, 30, 66, 9, 1),
  },
  {
    kind: "main",
    title: "Beef with broccoli, rice",
    titleZh: "西蘭花炒牛肉飯",
    totalMinutes: 20,
    ingredients: [
      ing("Beef", "牛肉", 120, "g", "meat"),
      ing("Broccoli", "西蘭花", 120, "g", "produce"),
      ing("Oyster sauce", "蠔油", 10, "ml", "dry_goods"),
      ing("Garlic", "蒜頭", 5, "g", "produce"),
      ing("Cornstarch", "生粉", 5, "g", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Marinate the sliced beef with the cornstarch.", "牛肉片用生粉醃好。", 10),
      step("Blanch the broccoli.", "西蘭花灼熟。", 2),
      step("Stir-fry the beef with garlic, add the broccoli and oyster sauce.", "蒜頭爆香炒牛肉，加西蘭花同蠔油。", 3),
    ],
    perServing: kcal(600, 33, 72, 18, 4),
  },
  {
    kind: "main",
    title: "Steamed pork patty with tofu, rice",
    titleZh: "豆腐蒸肉餅飯",
    totalMinutes: 25,
    ingredients: [
      ing("Minced pork", "免治豬肉", 100, "g", "meat"),
      ing("Tofu", "豆腐", 150, "g", "eggs_dairy_soy"),
      ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Season the pork and spread it over the sliced tofu.", "肉碎調味，鋪喺豆腐上面。"),
      step("Steam until cooked through.", "蒸至熟透。", 12),
    ],
    perServing: kcal(600, 33, 66, 21, 2),
  },
  {
    kind: "main",
    title: "Char siu with lettuce in oyster sauce, rice",
    titleZh: "叉燒蠔油生菜飯",
    totalMinutes: 15,
    ingredients: [
      ing("Char siu", "叉燒", 100, "g", "meat"),
      ing("Lettuce", "生菜", 150, "g", "produce"),
      ing("Oyster sauce", "蠔油", 10, "ml", "dry_goods"),
      ing("Garlic", "蒜頭", 5, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Blanch the lettuce and drizzle with oyster sauce.", "生菜灼熟，淋蠔油。", 2),
      step("Slice the char siu and serve with the rice.", "叉燒切片，配飯。"),
    ],
    perServing: kcal(650, 28, 82, 22, 2),
  },
  {
    kind: "main",
    title: "Chicken and potato curry, rice",
    titleZh: "咖喱雞薯仔飯",
    totalMinutes: 40,
    ingredients: [
      ing("Chicken thigh", "雞髀", 150, "g", "meat"),
      ing("Potato", "薯仔", 120, "g", "produce"),
      ing("Onion", "洋蔥", 60, "g", "produce"),
      ing("Curry paste", "咖喱醬", 20, "g", "dry_goods"),
      ing("Coconut milk", "椰奶", 50, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Brown the chicken with the onion.", "雞件同洋蔥炒香。", 5),
      step("Add the curry paste, potato and a cup of water, and simmer.", "加咖喱醬、薯仔同一杯水，慢火炆。", 25),
      step("Stir in the coconut milk.", "最後加椰奶。", 2),
    ],
    perServing: kcal(720, 32, 88, 25, 5),
  },
  {
    kind: "main",
    title: "Stir-fried udon with pork and vegetables",
    titleZh: "雜菜豬肉炒烏冬",
    totalMinutes: 15,
    ingredients: [
      ing("Udon", "烏冬", 200, "g", "dry_goods"),
      ing("Pork", "豬肉", 60, "g", "meat"),
      ing("Cabbage", "椰菜", 100, "g", "produce"),
      ing("Carrot", "甘筍", 40, "g", "produce"),
      ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
    ],
    steps: [
      step("Loosen the udon in hot water.", "烏冬用熱水浸散。", 1),
      step("Stir-fry the pork, then the vegetables.", "先炒豬肉，再炒雜菜。", 4),
      step("Add the udon and soy sauce and toss.", "加烏冬同豉油兜勻。", 2),
    ],
    perServing: kcal(560, 24, 80, 14, 5),
  },
  {
    kind: "main",
    title: "Scrambled eggs with shrimp, rice",
    titleZh: "蝦仁炒蛋飯",
    totalMinutes: 15,
    ingredients: [
      ing("Shrimp", "蝦仁", 80, "g", "seafood"),
      ing("Egg", "雞蛋", 2, "piece", "eggs_dairy_soy"),
      ing("Spring onion", "葱", 10, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Blanch the shrimp.", "蝦仁灼熟。", 1),
      step("Pour in the beaten eggs and stir gently until just set.", "倒入蛋漿輕手炒至半凝固。", 2),
    ],
    perServing: kcal(540, 30, 64, 16, 1),
  },
  {
    kind: "main",
    title: "Pork rib and winter melon soup, rice",
    titleZh: "冬瓜排骨湯飯",
    totalMinutes: 60,
    ingredients: [
      ing("Pork ribs", "排骨", 120, "g", "meat"),
      ing("Winter melon", "冬瓜", 200, "g", "produce"),
      ing("Ginger", "薑", 5, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Blanch the ribs.", "排骨飛水。", 3),
      step("Simmer the ribs, winter melon and ginger in water.", "排骨、冬瓜同薑加水慢火煲。", 50),
    ],
    perServing: kcal(520, 24, 66, 18, 2),
  },
  {
    kind: "main",
    title: "Pork chop with onion, rice",
    titleZh: "洋蔥豬扒飯",
    totalMinutes: 25,
    ingredients: [
      ing("Pork chop", "豬扒", 150, "g", "meat"),
      ing("Onion", "洋蔥", 60, "g", "produce"),
      ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Pan-fry the pork chop until cooked through.", "豬扒煎至熟透。", 8),
      step("Soften the onion in the same pan with the soy sauce.", "同一個鑊炒軟洋蔥，加豉油。", 4),
    ],
    perServing: kcal(690, 35, 70, 28, 2),
  },
  {
    kind: "main",
    title: "Chicken with choy sum, rice",
    titleZh: "菜心炒雞柳飯",
    totalMinutes: 15,
    ingredients: [
      ing("Chicken breast", "雞胸肉", 120, "g", "meat"),
      ing("Choy sum", "菜心", 150, "g", "produce"),
      ing("Garlic", "蒜頭", 5, "g", "produce"),
      ing("Oyster sauce", "蠔油", 10, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Stir-fry the chicken strips until cooked.", "雞柳炒熟。", 4),
      step("Add the garlic and choy sum, then the oyster sauce.", "加蒜頭同菜心，再加蠔油。", 3),
    ],
    perServing: kcal(520, 38, 68, 9, 3),
  },
  {
    kind: "main",
    title: "Steamed egg custard with choy sum, rice",
    titleZh: "蒸水蛋菜心飯",
    totalMinutes: 20,
    ingredients: [
      ing("Egg", "雞蛋", 2, "piece", "eggs_dairy_soy"),
      ing("Choy sum", "菜心", 150, "g", "produce"),
      ing("Soy sauce", "豉油", 5, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Beat the eggs with warm water and steam gently.", "雞蛋加暖水打勻，慢火蒸。", 10),
      step("Blanch the choy sum. Drizzle soy sauce over the egg.", "菜心灼熟，水蛋淋豉油。", 2),
    ],
    perServing: kcal(470, 20, 68, 12, 3),
  },
  {
    kind: "main",
    title: "Salmon fried rice",
    titleZh: "三文魚炒飯",
    totalMinutes: 15,
    ingredients: [
      ing("Salmon", "三文魚", 100, "g", "seafood"),
      ing("Egg", "雞蛋", 1, "piece", "eggs_dairy_soy"),
      ing("Peas", "青豆", 40, "g", "produce"),
      ing("Spring onion", "葱", 10, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Cook the rice ahead and let it cool.", "飯預先煮好放涼。", 25),
      step("Fry the salmon pieces, then the egg, then the rice and peas.", "先煎三文魚粒，再炒蛋，加飯同青豆炒勻。", 6),
    ],
    perServing: kcal(620, 31, 70, 22, 3),
  },
  {
    kind: "main",
    title: "Diced pork with sweetcorn sauce, rice",
    titleZh: "粟米肉粒飯",
    totalMinutes: 20,
    ingredients: [
      ing("Pork", "豬肉", 100, "g", "meat"),
      ing("Sweetcorn", "粟米", 80, "g", "produce"),
      ing("Egg", "雞蛋", 1, "piece", "eggs_dairy_soy"),
      ing("Cornstarch", "生粉", 5, "g", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Fry the diced pork until cooked.", "肉粒炒熟。", 4),
      step("Simmer the sweetcorn, thicken with cornstarch and stir in the egg.", "粟米煮滾，埋芡，再拌入蛋花。", 4),
    ],
    perServing: kcal(640, 30, 82, 20, 3),
  },
  {
    kind: "main",
    title: "Steamed pork ribs in black bean sauce, rice",
    titleZh: "豉汁蒸排骨飯",
    totalMinutes: 30,
    ingredients: [
      ing("Pork ribs", "排骨", 120, "g", "meat"),
      ing("Fermented black beans", "豆豉", 10, "g", "dry_goods"),
      ing("Garlic", "蒜頭", 5, "g", "produce"),
      ing("Cornstarch", "生粉", 5, "g", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Toss the ribs with the black beans, garlic and cornstarch.", "排骨加豆豉、蒜蓉同生粉撈勻。", 10),
      step("Steam until cooked through.", "蒸至熟透。", 15),
    ],
    perServing: kcal(620, 26, 70, 25, 2),
  },
  {
    kind: "main",
    title: "Mapo tofu with minced pork, rice",
    titleZh: "麻婆豆腐飯",
    totalMinutes: 20,
    ingredients: [
      ing("Tofu", "豆腐", 200, "g", "eggs_dairy_soy"),
      ing("Minced pork", "免治豬肉", 50, "g", "meat"),
      ing("Chilli bean paste", "豆瓣醬", 15, "g", "dry_goods"),
      ing("Spring onion", "葱", 10, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Fry the pork with the chilli bean paste.", "免治豬肉加豆瓣醬炒香。", 3),
      step("Add the diced tofu and a little water, and simmer.", "加豆腐粒同少少水，慢火煮。", 5),
    ],
    perServing: kcal(580, 27, 70, 21, 3),
  },
  {
    kind: "main",
    title: "Steamed prawns with garlic, rice",
    titleZh: "蒜蓉蒸蝦飯",
    totalMinutes: 20,
    ingredients: [
      ing("Prawns", "蝦", 150, "g", "seafood"),
      ing("Garlic", "蒜頭", 10, "g", "produce"),
      ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
      RICE,
    ],
    steps: [
      step("Butterfly the prawns and top with minced garlic.", "蝦開邊，鋪蒜蓉。", 8),
      step("Steam, then drizzle with soy sauce.", "蒸熟後淋豉油。", 5),
    ],
    perServing: kcal(470, 28, 66, 9, 1),
  },
  {
    kind: "main",
    title: "Bitter melon with egg, rice",
    titleZh: "涼瓜炒蛋飯",
    totalMinutes: 15,
    ingredients: [
      ing("Bitter melon", "涼瓜", 150, "g", "produce"),
      ing("Egg", "雞蛋", 2, "piece", "eggs_dairy_soy"),
      ing("Garlic", "蒜頭", 5, "g", "produce"),
      RICE,
    ],
    steps: [
      step("Slice the bitter melon thinly and stir-fry with garlic.", "涼瓜切薄片，同蒜頭炒軟。", 4),
      step("Pour in the beaten eggs and fold until set.", "倒入蛋漿兜至凝固。", 2),
    ],
    perServing: kcal(500, 19, 70, 15, 4),
  },
  {
    kind: "snack",
    title: "Yoghurt with apple",
    titleZh: "蘋果乳酪",
    totalMinutes: 5,
    ingredients: [ing("Yoghurt", "乳酪", 150, "g", "eggs_dairy_soy"), ing("Apple", "蘋果", 1, "piece", "produce")],
    steps: [step("Dice the apple over the yoghurt.", "蘋果切粒放落乳酪。")],
    perServing: kcal(190, 8, 32, 4, 3),
  },
  {
    kind: "snack",
    title: "Red bean soup",
    titleZh: "紅豆沙",
    totalMinutes: 90,
    ingredients: [
      ing("Red beans", "紅豆", 40, "g", "dry_goods"),
      ing("Rock sugar", "冰糖", 15, "g", "dry_goods"),
      ing("Dried tangerine peel", "陳皮", 2, "g", "dry_goods"),
    ],
    steps: [step("Simmer the beans with the peel until soft, then add the rock sugar.", "紅豆同陳皮煲至起沙，加冰糖。", 80)],
    perServing: kcal(210, 8, 44, 0.5, 6),
  },
  {
    kind: "snack",
    title: "Orange",
    titleZh: "橙",
    totalMinutes: 2,
    ingredients: [ing("Orange", "橙", 1, "piece", "produce")],
    steps: [step("Cut into wedges.", "切件。")],
    perServing: kcal(60, 1, 15, 0, 3),
  },
];

const kindOf = (slot: MealType): DemoDish["kind"] => (slot === "breakfast" || slot === "snack" ? slot : "main");

const allowed = (d: DemoDish, exclusions: string[]) => {
  const text = [d.title, d.titleZh, ...d.ingredients.flatMap((i) => [i.name, i.nameZh])].join("\n").toLowerCase();
  return !exclusions.some((e) => e && text.includes(e.toLowerCase()));
};

/** The demo library's dishes for a slot, minus anything the family excluded. */
export function demoPool(slot: MealType, exclusions: string[]): DemoDish[] {
  return DEMO_DISHES.filter((d) => d.kind === kindOf(slot) && allowed(d, exclusions));
}

// The demo words for a dish, lined up with its ingredients and steps; a language with any gap is left
// out so the preview shows what the app really does then (English).
function demoTranslations(d: DemoDish): PlanDish["translations"] {
  const out: PlanDish["translations"] = {};
  for (const lang of ["fil", "id"] as const) {
    const words = DEMO_DISH_WORDS[d.title]?.[lang];
    const ingredients = d.ingredients.map((i) => DEMO_INGREDIENT_WORDS[i.name]?.[lang]);
    if (words && words.steps.length === d.steps.length && ingredients.every((w): w is string => !!w)) {
      out[lang] = { title: words.title, ingredients, steps: [...words.steps] };
    }
  }
  return out;
}

/** A demo dish for one slot, picked by `index` from its pool (wrapping round). */
export function demoDish(planId: string, date: string, slot: MealType, index: number, exclusions: string[]): PlanDish {
  const pool = demoPool(slot, exclusions);
  const d = pool[((index % pool.length) + pool.length) % pool.length];
  return {
    id: `${planId}:${date}:${slot}`,
    planId,
    date,
    slot,
    title: d.title,
    titleZh: d.titleZh,
    ingredients: d.ingredients.map((i) => ({ ...i })),
    steps: d.steps.map((s, n) => ({ ...s, stepNumber: n + 1 })),
    totalMinutes: d.totalMinutes,
    perServing: { ...d.perServing },
    locked: false,
    loggedAt: null,
    translations: demoTranslations(d),
  };
}

/** A week's demo plan for the given days and slots: lunch and dinner walk the mains so no day repeats. */
export function demoWeekPlan(weekStart: string, days: string[], slots: MealType[], exclusions: string[]): WeekPlan {
  const planId = `demo-plan-${weekStart}`;
  const dishes: PlanDish[] = [];
  days.forEach((date, dayIndex) => {
    for (const slot of slots) {
      const index = slot === "dinner" ? dayIndex * 2 + 1 : slot === "lunch" ? dayIndex * 2 : dayIndex;
      dishes.push(demoDish(planId, date, slot, index, exclusions));
    }
  });
  return { id: planId, weekStart, generatedAt: new Date().toISOString(), regenUsed: 0, dishes, portions: {} };
}
