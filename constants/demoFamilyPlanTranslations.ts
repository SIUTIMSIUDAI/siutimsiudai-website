// Filipino (fil) and Indonesian (id) words for the demo dishes in constants/demoFamilyPlan.ts, so the
// helper-mode preview reads as it will once the AI has translated a real plan. Demo data only: live
// translations come from plan-week. Every string here is on the native-speaker review list
// (brainstorms/2026-10-26-helper-strings-review.md).

type Words = { fil: string; id: string };

/** Ingredient names by their English name in the demo library. */
export const DEMO_INGREDIENT_WORDS: Record<string, Words> = {
  Macaroni: { fil: "Macaroni", id: "Makaroni" },
  Ham: { fil: "Ham", id: "Ham" },
  Egg: { fil: "Itlog", id: "Telur" },
  "Chicken stock": { fil: "Sabaw ng manok", id: "Kaldu ayam" },
  Rice: { fil: "Bigas", id: "Beras" },
  "Lean pork": { fil: "Lean na karne ng baboy", id: "Daging babi tanpa lemak" },
  "Century egg": { fil: "Century egg", id: "Telur pitan" },
  Ginger: { fil: "Luya", id: "Jahe" },
  "Spring onion": { fil: "Dahon ng sibuyas", id: "Daun bawang" },
  Bread: { fil: "Tinapay", id: "Roti" },
  Milk: { fil: "Gatas", id: "Susu" },
  Butter: { fil: "Mantikilya", id: "Mentega" },
  "Rolled oats": { fil: "Oats", id: "Oat" },
  Banana: { fil: "Saging", id: "Pisang" },
  "Turnip cake": { fil: "Turnip cake", id: "Kue lobak" },
  "Soy milk": { fil: "Soy milk", id: "Susu kedelai" },
  Chicken: { fil: "Manok", id: "Ayam" },
  "Dark soy sauce": { fil: "Dark soy sauce", id: "Kecap asin hitam" },
  "Soy sauce": { fil: "Toyo", id: "Kecap asin" },
  "Rock sugar": { fil: "Rock sugar", id: "Gula batu" },
  Tomato: { fil: "Kamatis", id: "Tomat" },
  Sugar: { fil: "Asukal", id: "Gula" },
  "Sea bass": { fil: "Apahap", id: "Ikan kakap putih" },
  Beef: { fil: "Karne ng baka", id: "Daging sapi" },
  Broccoli: { fil: "Brokuli", id: "Brokoli" },
  "Oyster sauce": { fil: "Oyster sauce", id: "Saus tiram" },
  Garlic: { fil: "Bawang", id: "Bawang putih" },
  Cornstarch: { fil: "Gawgaw", id: "Tepung maizena" },
  "Minced pork": { fil: "Giniling na baboy", id: "Daging babi cincang" },
  Tofu: { fil: "Tokwa", id: "Tahu" },
  "Char siu": { fil: "Char siu", id: "Char siu" },
  Lettuce: { fil: "Litsugas", id: "Selada" },
  "Chicken thigh": { fil: "Hita ng manok", id: "Paha ayam" },
  Potato: { fil: "Patatas", id: "Kentang" },
  Onion: { fil: "Sibuyas", id: "Bawang bombai" },
  "Curry paste": { fil: "Curry paste", id: "Bumbu kari" },
  "Coconut milk": { fil: "Gata", id: "Santan" },
  Udon: { fil: "Udon", id: "Udon" },
  Pork: { fil: "Karne ng baboy", id: "Daging babi" },
  Cabbage: { fil: "Repolyo", id: "Kol" },
  Carrot: { fil: "Karot", id: "Wortel" },
  Shrimp: { fil: "Hipon", id: "Udang" },
  "Pork ribs": { fil: "Tadyang ng baboy", id: "Iga babi" },
  "Winter melon": { fil: "Kundol", id: "Kundur" },
  "Pork chop": { fil: "Pork chop", id: "Pork chop" },
  "Chicken breast": { fil: "Dibdib ng manok", id: "Dada ayam" },
  "Choy sum": { fil: "Choy sum", id: "Caisim" },
  Salmon: { fil: "Salmon", id: "Salmon" },
  Peas: { fil: "Gisantes", id: "Kacang polong" },
  Sweetcorn: { fil: "Mais", id: "Jagung manis" },
  "Fermented black beans": { fil: "Tausi", id: "Tausi" },
  "Chilli bean paste": { fil: "Chili bean paste", id: "Pasta cabai doubanjiang" },
  Prawns: { fil: "Sugpo", id: "Udang besar" },
  "Bitter melon": { fil: "Ampalaya", id: "Pare" },
  Yoghurt: { fil: "Yogurt", id: "Yoghurt" },
  Apple: { fil: "Mansanas", id: "Apel" },
  "Red beans": { fil: "Pulang munggo", id: "Kacang merah" },
  "Dried tangerine peel": { fil: "Tuyong balat ng dalandan", id: "Kulit jeruk kering" },
  Orange: { fil: "Dalandan", id: "Jeruk" },
};

/** Each demo dish's title and steps, by its English title, in the dish's own step order. */
export const DEMO_DISH_WORDS: Record<string, { fil: { title: string; steps: string[] }; id: { title: string; steps: string[] } }> = {
  "Macaroni soup with ham and egg": {
    fil: {
      title: "Macaroni soup na may ham at itlog",
      steps: [
        "Pakuluan ang macaroni hanggang lumambot, saka salain.",
        "Painitin ang sabaw, ilagay ang ham at macaroni.",
        "Magprito ng itlog at ilagay sa ibabaw.",
      ],
    },
    id: {
      title: "Sup makaroni dengan ham dan telur",
      steps: ["Rebus makaroni sampai lunak, lalu tiriskan.", "Panaskan kaldu, masukkan ham dan makaroni.", "Goreng satu telur dan taruh di atasnya."],
    },
  },
  "Congee with century egg and lean pork": {
    fil: {
      title: "Lugaw na may century egg at karne ng baboy",
      steps: [
        "Pakuluan nang mahina ang bigas sa maraming tubig hanggang dumurog.",
        "Ilagay ang hiniwang baboy, hiniwang century egg at luya.",
        "Budburan ng tinadtad na dahon ng sibuyas.",
      ],
    },
    id: {
      title: "Bubur dengan telur pitan dan daging babi",
      steps: [
        "Masak beras dengan banyak air di api kecil sampai hancur.",
        "Masukkan irisan daging babi, potongan telur pitan, dan jahe.",
        "Taburi dengan irisan daun bawang.",
      ],
    },
  },
  "Scrambled eggs on toast": {
    fil: {
      title: "Scrambled egg sa toast",
      steps: [
        "Batihin ang itlog kasama ang gatas.",
        "Lutuin nang dahan-dahan sa mantikilya sa mahinang apoy, habang hinahalo.",
        "Ihain sa ibabaw ng toast.",
      ],
    },
    id: {
      title: "Telur orak-arik di atas roti panggang",
      steps: ["Kocok telur dengan susu.", "Masak perlahan dengan mentega di api kecil sambil diaduk.", "Sajikan di atas roti panggang."],
    },
  },
  "Oat porridge with banana": {
    fil: { title: "Oatmeal na may saging", steps: ["Lutuin nang mahina ang oats sa gatas habang hinahalo.", "Hiwain ang saging at ilagay sa ibabaw."] },
    id: { title: "Bubur oat dengan pisang", steps: ["Masak oat dengan susu di api kecil sambil diaduk.", "Iris pisang dan taruh di atasnya."] },
  },
  "Pan-fried turnip cake with soy milk": {
    fil: {
      title: "Piniritong turnip cake at soy milk",
      steps: ["Hiwain ang turnip cake at iprito hanggang mag-golden ang magkabilang gilid.", "Painitin ang soy milk."],
    },
    id: {
      title: "Kue lobak goreng dengan susu kedelai",
      steps: ["Potong kue lobak dan goreng sampai keemasan di kedua sisi.", "Hangatkan susu kedelai."],
    },
  },
  "Soy sauce chicken with rice": {
    fil: {
      title: "Manok sa toyo na may kanin",
      steps: [
        "Magsaing.",
        "Pakuluan ang mga toyo, rock sugar, luya at isang tasang tubig.",
        "Ilaga ang manok dito sa mahinang apoy, baliktarin nang isang beses, saka tadtarin.",
      ],
    },
    id: {
      title: "Ayam kecap asin dengan nasi",
      steps: [
        "Masak nasi.",
        "Didihkan kecap asin, gula batu, jahe, dan satu cangkir air.",
        "Rebus ayam di dalamnya dengan api kecil, balik sekali, lalu potong-potong.",
      ],
    },
  },
  "Tomato and egg stir-fry with rice": {
    fil: {
      title: "Ginisang kamatis at itlog na may kanin",
      steps: [
        "Lutuin ang itlog hanggang halos buo na, saka itabi.",
        "Igisa ang hiniwang kamatis kasama ang asukal hanggang lumabas ang katas.",
        "Ibalik ang itlog, ilagay ang dahon ng sibuyas, at ihain sa kanin.",
      ],
    },
    id: {
      title: "Tumis tomat dan telur dengan nasi",
      steps: [
        "Orak-arik telur sampai setengah matang, lalu sisihkan.",
        "Tumis potongan tomat dengan gula sampai berkuah.",
        "Masukkan kembali telur, tambahkan daun bawang, dan sajikan di atas nasi.",
      ],
    },
  },
  "Steamed sea bass with ginger and spring onion, rice": {
    fil: {
      title: "Steamed na apahap na may luya at dahon ng sibuyas, may kanin",
      steps: ["Ilagay ang isda sa ibabaw ng hiniwang luya at i-steam.", "Lagyan ng dahon ng sibuyas, saka buhusan ng mainit na mantika at toyo."],
    },
    id: {
      title: "Ikan kakap kukus dengan jahe dan daun bawang, dengan nasi",
      steps: ["Letakkan ikan di atas irisan jahe lalu kukus.", "Taburi daun bawang, lalu siram dengan minyak panas dan kecap asin."],
    },
  },
  "Beef with broccoli, rice": {
    fil: {
      title: "Baka na may brokuli, may kanin",
      steps: [
        "I-marinate ang hiniwang baka sa gawgaw.",
        "Bahagyang pakuluan ang brokuli.",
        "Igisa ang baka sa bawang, saka idagdag ang brokuli at oyster sauce.",
      ],
    },
    id: {
      title: "Daging sapi dengan brokoli, dengan nasi",
      steps: [
        "Marinasi irisan daging sapi dengan tepung maizena.",
        "Rebus sebentar brokoli.",
        "Tumis daging sapi dengan bawang putih, lalu masukkan brokoli dan saus tiram.",
      ],
    },
  },
  "Steamed pork patty with tofu, rice": {
    fil: {
      title: "Steamed na giniling na baboy sa tokwa, may kanin",
      steps: ["Timplahan ang giniling na baboy at ikalat sa ibabaw ng hiniwang tokwa.", "I-steam hanggang maluto nang husto."],
    },
    id: {
      title: "Daging babi cincang kukus dengan tahu, dengan nasi",
      steps: ["Bumbui daging babi cincang dan ratakan di atas irisan tahu.", "Kukus sampai matang sempurna."],
    },
  },
  "Char siu with lettuce in oyster sauce, rice": {
    fil: {
      title: "Char siu at litsugas sa oyster sauce, may kanin",
      steps: ["Bahagyang pakuluan ang litsugas at buhusan ng oyster sauce.", "Hiwain ang char siu at ihain kasama ng kanin."],
    },
    id: {
      title: "Char siu dengan selada saus tiram, dengan nasi",
      steps: ["Rebus sebentar selada lalu siram dengan saus tiram.", "Iris char siu dan sajikan dengan nasi."],
    },
  },
  "Chicken and potato curry, rice": {
    fil: {
      title: "Curry na manok at patatas, may kanin",
      steps: [
        "Iprito ang manok kasama ang sibuyas hanggang pumula.",
        "Ilagay ang curry paste, patatas at isang tasang tubig, at pakuluan nang mahina.",
        "Ihalo ang gata.",
      ],
    },
    id: {
      title: "Kari ayam dan kentang, dengan nasi",
      steps: [
        "Tumis ayam dengan bawang bombai sampai kecokelatan.",
        "Masukkan bumbu kari, kentang, dan satu cangkir air, lalu masak dengan api kecil.",
        "Aduk santan ke dalamnya.",
      ],
    },
  },
  "Stir-fried udon with pork and vegetables": {
    fil: {
      title: "Ginisang udon na may baboy at gulay",
      steps: [
        "Ibabad sandali ang udon sa mainit na tubig para lumuwag.",
        "Igisa muna ang baboy, saka ang mga gulay.",
        "Ilagay ang udon at toyo at haluin.",
      ],
    },
    id: {
      title: "Udon tumis dengan daging babi dan sayuran",
      steps: [
        "Rendam udon sebentar di air panas agar terurai.",
        "Tumis daging babi dulu, lalu sayurannya.",
        "Masukkan udon dan kecap asin, lalu aduk rata.",
      ],
    },
  },
  "Scrambled eggs with shrimp, rice": {
    fil: {
      title: "Scrambled egg na may hipon, may kanin",
      steps: ["Bahagyang pakuluan ang hipon.", "Ibuhos ang binating itlog at haluin nang dahan-dahan hanggang halos buo na."],
    },
    id: {
      title: "Telur orak-arik dengan udang, dengan nasi",
      steps: ["Rebus sebentar udangnya.", "Tuang telur kocok dan aduk perlahan sampai setengah matang."],
    },
  },
  "Pork rib and winter melon soup, rice": {
    fil: {
      title: "Sabaw ng tadyang ng baboy at kundol, may kanin",
      steps: ["Pakuluan sandali ang tadyang at itapon ang tubig.", "Pakuluan nang mahina ang tadyang, kundol at luya sa tubig."],
    },
    id: {
      title: "Sup iga babi dan kundur, dengan nasi",
      steps: ["Rebus sebentar iganya, lalu buang airnya.", "Rebus iga, kundur, dan jahe dengan api kecil."],
    },
  },
  "Pork chop with onion, rice": {
    fil: {
      title: "Pork chop na may sibuyas, may kanin",
      steps: ["Iprito ang pork chop hanggang maluto nang husto.", "Sa parehong kawali, palambutin ang sibuyas kasama ang toyo."],
    },
    id: {
      title: "Pork chop dengan bawang bombai, dengan nasi",
      steps: ["Goreng pork chop sampai matang sempurna.", "Di wajan yang sama, tumis bawang bombai sampai layu dengan kecap asin."],
    },
  },
  "Chicken with choy sum, rice": {
    fil: {
      title: "Manok na may choy sum, may kanin",
      steps: ["Igisa ang hiniwang manok hanggang maluto.", "Ilagay ang bawang at choy sum, saka ang oyster sauce."],
    },
    id: {
      title: "Ayam dengan caisim, dengan nasi",
      steps: ["Tumis potongan ayam sampai matang.", "Masukkan bawang putih dan caisim, lalu saus tiram."],
    },
  },
  "Steamed egg custard with choy sum, rice": {
    fil: {
      title: "Steamed na itlog at choy sum, may kanin",
      steps: [
        "Batihin ang itlog kasama ang maligamgam na tubig at i-steam sa mahinang apoy.",
        "Bahagyang pakuluan ang choy sum. Buhusan ng toyo ang itlog.",
      ],
    },
    id: {
      title: "Telur kukus dan caisim, dengan nasi",
      steps: ["Kocok telur dengan air hangat lalu kukus dengan api kecil.", "Rebus sebentar caisim. Siram kecap asin di atas telur."],
    },
  },
  "Salmon fried rice": {
    fil: {
      title: "Sinangag na may salmon",
      steps: ["Magsaing nang mas maaga at palamigin.", "Iprito muna ang salmon, saka ang itlog, saka ang kanin at gisantes."],
    },
    id: {
      title: "Nasi goreng salmon",
      steps: ["Masak nasi lebih dulu dan biarkan dingin.", "Goreng potongan salmon, lalu telur, lalu nasi dan kacang polong."],
    },
  },
  "Diced pork with sweetcorn sauce, rice": {
    fil: {
      title: "Hiniwang baboy sa sarsang mais, may kanin",
      steps: ["Iprito ang hiniwang baboy hanggang maluto.", "Pakuluan ang mais, palaputin gamit ang gawgaw, at ihalo ang itlog."],
    },
    id: {
      title: "Daging babi potong dadu saus jagung, dengan nasi",
      steps: ["Goreng daging babi potong dadu sampai matang.", "Didihkan jagung, kentalkan dengan tepung maizena, lalu aduk telur ke dalamnya."],
    },
  },
  "Steamed pork ribs in black bean sauce, rice": {
    fil: {
      title: "Steamed na tadyang ng baboy sa tausi, may kanin",
      steps: ["Haluin ang tadyang kasama ang tausi, bawang at gawgaw.", "I-steam hanggang maluto nang husto."],
    },
    id: {
      title: "Iga babi kukus saus tausi, dengan nasi",
      steps: ["Aduk iga dengan tausi, bawang putih, dan tepung maizena.", "Kukus sampai matang sempurna."],
    },
  },
  "Mapo tofu with minced pork, rice": {
    fil: {
      title: "Mapo tofu na may giniling na baboy, may kanin",
      steps: ["Igisa ang baboy kasama ang chili bean paste.", "Ilagay ang hiniwang tokwa at kaunting tubig, at pakuluan nang mahina."],
    },
    id: {
      title: "Mapo tahu dengan daging babi cincang, dengan nasi",
      steps: ["Tumis daging babi dengan pasta cabai doubanjiang.", "Masukkan tahu potong dadu dan sedikit air, lalu masak dengan api kecil."],
    },
  },
  "Steamed prawns with garlic, rice": {
    fil: {
      title: "Steamed na sugpo na may bawang, may kanin",
      steps: ["Hatiin sa likod ang sugpo at lagyan ng dinikdik na bawang.", "I-steam, saka buhusan ng toyo."],
    },
    id: {
      title: "Udang kukus bawang putih, dengan nasi",
      steps: ["Belah punggung udang dan taburi bawang putih cincang.", "Kukus, lalu siram dengan kecap asin."],
    },
  },
  "Bitter melon with egg, rice": {
    fil: {
      title: "Ampalaya na may itlog, may kanin",
      steps: ["Hiwain nang manipis ang ampalaya at igisa sa bawang.", "Ibuhos ang binating itlog at haluin hanggang mabuo."],
    },
    id: {
      title: "Tumis pare dengan telur, dengan nasi",
      steps: ["Iris tipis pare dan tumis dengan bawang putih.", "Tuang telur kocok dan aduk sampai matang."],
    },
  },
  "Yoghurt with apple": {
    fil: { title: "Yogurt na may mansanas", steps: ["Hiwain nang maliliit ang mansanas at ilagay sa yogurt."] },
    id: { title: "Yoghurt dengan apel", steps: ["Potong dadu apel dan taruh di atas yoghurt."] },
  },
  "Red bean soup": {
    fil: {
      title: "Matamis na sabaw ng pulang munggo",
      steps: ["Pakuluan nang mahina ang munggo kasama ang balat ng dalandan hanggang lumambot, saka ilagay ang rock sugar."],
    },
    id: { title: "Bubur kacang merah", steps: ["Rebus kacang merah dengan kulit jeruk sampai lunak, lalu tambahkan gula batu."] },
  },
  Orange: {
    fil: { title: "Dalandan", steps: ["Hiwain nang pahaba."] },
    id: { title: "Jeruk", steps: ["Potong-potong menjadi juring."] },
  },
};
