import { alsoCovers, exclusionTerms, foldText, GROUPS, namesTerm } from "../supabase/functions/plan-week/exclusions";

// What a member's "Foods I don't eat" entry stands for when plan-week checks a dish. Members type
// free text, in English or Chinese, so "pork" has to catch ham and 叉燒 as well, and "peanuts" has to
// catch peanut oil. Found 2026-11-18: with "pork" excluded, both models planned 火腿蛋治.

const caught = (exclusion: string, text: string) =>
  exclusionTerms(exclusion).some((t) => namesTerm(foldText(text), t));

describe("exclusionTerms: what one entry stands for", () => {
  it("keeps the member's own words, whatever they are", () => {
    expect(caught("芫茜", "Coriander / 芫茜")).toBe(true);
    expect(caught("Bitter melon", "bitter melon")).toBe(true);
    expect(caught("芫茜", "Spring onion / 蔥")).toBe(false);
    expect(exclusionTerms("  ")).toEqual([]);
  });

  it("reads the food out of 'no pork', '唔食豬肉' and 'peanut allergy'", () => {
    expect(caught("no pork", "Pork chop rice")).toBe(true);
    expect(caught("唔食豬肉", "Pork chop rice / 豬扒飯")).toBe(true);
    expect(caught("peanut allergy", "Peanut oil")).toBe(true);
    expect(caught("走蔥", "Spring onion / 蔥")).toBe(true);
    expect(caught("蝦過敏", "Prawn / 蝦")).toBe(true);
  });

  it("matches a plural to the singular", () => {
    expect(caught("peanuts", "Peanut oil / 花生油")).toBe(true);
    expect(caught("prawns", "King prawn")).toBe(true);
    expect(caught("tomatoes", "Tomato / 番茄")).toBe(true);
    expect(caught("eggs", "Egg noodles")).toBe(true);
  });

  it("matches the singular as a whole word only, so peas never catch peanuts or peaches", () => {
    expect(caught("peas", "Green peas / 青豆")).toBe(true);
    expect(caught("peas", "Pea shoots / 豆苗")).toBe(true);
    expect(caught("peas", "Peanut / 花生")).toBe(false);
    expect(caught("peas", "Peach")).toBe(false);
  });

  it("reads lactose intolerance as dairy", () => {
    expect(caught("lactose intolerant", "Cheese")).toBe(true);
    expect(caught("乳糖不耐", "芝士")).toBe(true);
  });

  it("gives every name one group only", () => {
    expect(GROUPS.flatMap((g) => g.names.map(foldText)).filter((n, i, all) => all.indexOf(n) !== i)).toEqual([]);
  });

  it("widens pork to the foods made from it, in both languages", () => {
    for (const text of ["Ham and egg sandwich", "火腿蛋治", "Char siu rice", "叉燒飯", "Luncheon meat", "午餐肉", "Bacon", "煙肉", "Chinese sausage / 臘腸", "Spare ribs / 排骨", "Siu mai / 燒賣", "Lard / 豬油"]) {
      expect(caught("pork", text)).toBe(true);
    }
    expect(caught("豬肉", "Ham")).toBe(true);
    expect(caught("pork", "皮蛋瘦肉粥")).toBe(true);
    expect(caught("pork", "餐蛋麵")).toBe(true);
    expect(caught("pork", "Steamed fish / 蒸魚")).toBe(false);
  });

  it("widens beef without catching milk or butter", () => {
    expect(caught("beef", "牛腩")).toBe(true);
    expect(caught("beef", "Brisket")).toBe(true);
    expect(caught("beef", "Beef ho fun / 乾炒牛河")).toBe(true);
    expect(caught("beef", "Milk / 牛奶")).toBe(false);
    expect(caught("beef", "Butter / 牛油")).toBe(false);
  });

  it("widens chicken without catching eggs", () => {
    expect(caught("chicken", "雞翼")).toBe(true);
    expect(caught("chicken", "Chicken feet / 鳳爪")).toBe(true);
    expect(caught("chicken", "Egg / 雞蛋")).toBe(false);
  });

  it("widens seafood, fish and shellfish to the sea foods and sauces in them", () => {
    expect(caught("seafood", "Prawn")).toBe(true);
    expect(caught("海鮮", "Oyster sauce / 蠔油")).toBe(true);
    expect(caught("seafood", "Sole fillet / 龍脷柳")).toBe(true);
    expect(caught("fish", "Salmon")).toBe(true);
    expect(caught("fish", "Fish sauce / 魚露")).toBe(true);
    expect(caught("shellfish", "Dried shrimp / 蝦米")).toBe(true);
    expect(caught("shellfish", "Dried scallop / 瑤柱")).toBe(true);
    expect(caught("shellfish", "XO sauce")).toBe(true);
    expect(caught("shellfish", "Fusilli / 螺絲粉")).toBe(false);
    expect(caught("shellfish", "Oyster mushroom / 蠔菇")).toBe(false);
    expect(caught("蝦", "Prawn")).toBe(true);
    expect(caught("crab", "蟹")).toBe(true);
  });

  it("widens egg to mayonnaise, without catching eggplant", () => {
    expect(caught("蛋", "Egg")).toBe(true);
    expect(caught("egg", "Mayonnaise")).toBe(true);
    expect(caught("eggs", "Eggplant / 茄子")).toBe(false);
    expect(caught("egg", "Eggplant with egg")).toBe(true);
  });

  it("widens dairy to cheese, butter and cream, without catching coconut or soy milk", () => {
    for (const text of ["Cheese", "芝士", "Butter", "牛油", "忌廉", "Evaporated milk / 淡奶", "Yoghurt"]) {
      expect(caught("dairy", text)).toBe(true);
    }
    expect(caught("milk", "Cheese")).toBe(true);
    expect(caught("奶", "Butter")).toBe(true);
    expect(caught("dairy", "Coconut milk / 椰奶")).toBe(false);
    expect(caught("dairy", "Soy milk / 豆奶")).toBe(false);
    expect(caught("dairy", "Peanut butter / 花生醬")).toBe(false);
    expect(caught("dairy", "Avocado / 牛油果")).toBe(false);
  });

  it("widens nuts to every nut and peanut sauce, without catching coconut or water chestnut", () => {
    for (const text of ["Cashew / 腰果", "Walnut / 合桃", "Almond / 杏仁", "Satay sauce / 沙嗲醬", "Peanut / 花生"]) {
      expect(caught("nuts", text)).toBe(true);
    }
    expect(caught("堅果", "Cashew")).toBe(true);
    expect(caught("nuts", "Coconut milk")).toBe(false);
    expect(caught("nuts", "Nutmeg")).toBe(false);
    expect(caught("nuts", "Water chestnut / 馬蹄")).toBe(false);
    expect(caught("花生", "Satay")).toBe(true);
  });

  it("widens sesame, soy, alcohol and spicy to their usual forms", () => {
    expect(caught("sesame", "麻油")).toBe(true);
    expect(caught("soy", "Tofu / 豆腐")).toBe(true);
    expect(caught("soy", "Fermented black beans / 豆豉")).toBe(true);
    expect(caught("alcohol", "Shaoxing wine / 紹興酒")).toBe(true);
    expect(caught("酒", "Mirin")).toBe(true);
    expect(caught("alcohol", "Chicken drumstick")).toBe(false);
    expect(caught("spicy", "Red chilli / 紅辣椒")).toBe(true);
    expect(caught("辣", "Chilli bean paste / 豆瓣醬")).toBe(true);
  });

  it("treats 葱 and 蔥, 鷄 and 雞, 麪 and 麵 as the same word", () => {
    expect(caught("蔥", "薑葱蒸魚")).toBe(true);
    expect(caught("鷄", "雞翼")).toBe(true);
    expect(caught("麵", "公仔麪")).toBe(true);
  });
});

describe("alsoCovers: what the prompt spells out", () => {
  it("lists what a common exclusion covers, beyond the word itself", () => {
    const pork = alsoCovers("pork");
    expect(pork).toEqual(expect.arrayContaining(["ham", "bacon", "char siu", "luncheon meat", "火腿", "叉燒"]));
    expect(pork).not.toContain("pork");
    expect(alsoCovers("唔食豬肉")).toEqual(pork);
  });

  it("adds nothing for a food with no group", () => {
    expect(alsoCovers("芫茜")).toEqual([]);
    expect(alsoCovers("bitter melon")).toEqual([]);
  });
});
