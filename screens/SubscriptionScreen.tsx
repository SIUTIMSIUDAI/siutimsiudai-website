import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { LegalLinks } from "@/components/LegalLinks";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import {
  MAX_DAILY_FREE_AI_LOGS,
  SubscriptionTier,
  useSubscriptionStore,
} from "@/stores/useSubscriptionStore";
import { resolvePaywallCta } from "@/utils/paywallCta";
import { FAMILY_MAX_MEMBERS } from "@/utils/familyInvite";
import { purchaseSuccessBody, trialCta, trialPriceLine } from "@/utils/freeTrial";
import {
  configureRevenueCat,
  getSubscriptionOfferings,
  isBillingConfigured,
  purchaseSubscription,
  restoreSubscription,
  type LiveOfferings,
  type PurchaseFailure,
  type TierOption,
} from "@/services/revenueCatService";

interface Plan {
  tier: SubscriptionTier;
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  persona: string;
  price: string;
  priceUnit: string;
  priceSub: string;
  annualPrice: string;
  annualUnit: string;
  annualSub: string;
  pitch: string;
  features: string[];
  cta: string;
  ctaBg: string;
  accentColor: string;
  iconBg: string;
  cardClass: string;
  ribbon?: string;
  successTitle: string;
  successBody: string;
}

/**
 * Full-bleed, high-converting tier comparison. Three cards laid out casual-to-premium:
 * a plain Free card, a Milk Tea Amber Pro card ribboned as the plan most people pick, and a
 * radiant Egg-Tart Gold Max card.
 *
 * The CTA has three modes, and keeping them apart is the point:
 *  - live: a real StoreKit purchase through RevenueCat.
 *  - demo (`!isBillingConfigured`, so Expo Go or web): simulate the checkout and flip the tier
 *    locally, which is how the gates get exercised in development.
 *  - configured but unreachable: refuse and say so. This branch used to fall through to the demo
 *    one, which handed out a paid tier for nothing and announced a purchase that never happened.
 */
export function SubscriptionScreen() {
  const { tl, locale } = useLocale();
  const activeTier = useSubscriptionStore((s) => s.activeTier);
  const setTier = useSubscriptionStore((s) => s.setTier);
  const [annual, setAnnual] = useState(false);

  // Live billing state. `offerings` holds store-localized prices + purchasable packages when a
  // real RevenueCat build is running; it stays null on web and in Expo Go, where the screen falls
  // back to the built-in HK$ copy and the simulated checkout below. `busy` drives the full-screen
  // sync overlay while a purchase or restore is in flight.
  const [offerings, setOfferings] = useState<LiveOfferings | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  // Whether the one-shot configure attempt has come back yet. Without this the screen would flash
  // the "store unreachable" state for the split second before RevenueCat answers.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await configureRevenueCat();
      if (cancelled) return;
      setLive(ready);
      // `settled` flips only once the offerings fetch has also finished, so the banner below
      // reflects the final state instead of blinking on during the round trip.
      if (ready) {
        const fetched = await getSubscriptionOfferings();
        if (cancelled) return;
        setOfferings(fetched);
      }
      if (!cancelled) setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // This build ships real billing, but we cannot actually sell right now: either RevenueCat never
  // configured, or it configured and returned no offerings. NOT the same as a build with no
  // billing at all, which is a demo and may simulate a checkout. Here the honest move is to say so.
  // Granting the tier would hand out Pro for free and tell the user they had paid for it.
  const billingUnavailable = isBillingConfigured && settled && (!live || offerings === null);

  // Whether any plan card on screen offers a free trial, which brings in the trial small print.
  const trialOnScreen = [offerings?.pro, offerings?.max].some(
    (p) => (annual ? p?.annual : p?.monthly)?.trial != null,
  );

  const plans: Plan[] = [
    {
      tier: "free",
      icon: "cafe",
      name: tl("Free", "免費"),
      persona: tl("The Casual Eater", "街坊食客"),
      price: "HK$0",
      priceUnit: tl("/ forever", "/ 永遠"),
      priceSub: "",
      annualPrice: "HK$0",
      annualUnit: tl("/ forever", "/ 永遠"),
      annualSub: "",
      pitch: tl("Clock your daily calories, no strings attached.", "日日記低卡路里，唔使畀一蚊。"),
      // Every feature line on these three cards must match what the app really does (gates live in
      // hooks/useFeatureAccess.ts, plus isPaidTier for vitamins, history extras and family sync).
      // Owner, 2026-10-18: the unbuilt household calendar and the untracked sugar/sodium claim are
      // gone, and the free list says what is truly free. Owner, 2026-11-17: protein, carbs and fat
      // are free, and the free photo log is daily (macro_drawer, MAX_DAILY_FREE_AI_LOGS).
      features: [
        tl("Daily calories, plus protein, carbs and fat", "每日卡路里，加埋蛋白質、碳水同脂肪"),
        tl("Unlimited logging by typing, voice or barcode", "打字、語音、掃碼記錄唔限次"),
        tl(
          `${MAX_DAILY_FREE_AI_LOGS} AI photo log${MAX_DAILY_FREE_AI_LOGS === 1 ? "" : "s"} a day`,
          `每日 ${MAX_DAILY_FREE_AI_LOGS} 次 AI 影相入數`,
        ),
        tl("Fridge scan into your pantry", "影雪櫃自動記存貨"),
        tl("1-tap 少甜 / 走甜 / 少底 on your meals", "記低嘅餐一撳少甜、走甜、少底"),
        tl("Personal grocery checklist", "個人購物清單"),
      ],
      cta: tl("Switch to Free", "轉返做街坊"),
      ctaBg: colors.ink,
      accentColor: colors.inkMuted,
      iconBg: colors.surfaceSunken,
      cardClass: "border border-[#E4DCCB] bg-surface",
      successTitle: tl("Back to the streets", "做返街坊"),
      successBody: tl(
        "You're on the Free plan. The daily habit stays on us.",
        "你而家用緊免費版，日日記低卡路里我哋請。",
      ),
    },
    {
      tier: "pro",
      icon: "star",
      name: tl("Pro", "Pro 熟客"),
      persona: tl("The Healthy Foodie", "識食健康派"),
      price: "HK$58",
      priceUnit: tl("/ month", "/ 月"),
      priceSub: tl("or HK$488 / year", "或 HK$488 / 年"),
      annualPrice: "HK$488",
      annualUnit: tl("/ year", "/ 年"),
      annualSub: tl("Just HK$41 / month, billed yearly", "折合每月 HK$41，全年結算"),
      pitch: tl("Cheaper than one lunch set a month.", "平過每個月一個午餐常餐。"),
      features: [
        tl("Unlimited AI photo logging", "無限次 AI 影相入數"),
        tl("All nutrients: fibre, sodium, vitamins and minerals", "全部營養：纖維、鈉、維他命同礦物質"),
        // Past days' calories, protein, carbs and fat are free since 2026-11-17 (macro_drawer); Pro
        // adds the meal list (meal_history) and the nutrient report.
        tl("Look back at past days: meals and nutrient report", "睇返過往每日食咗乜同營養報告"),
        tl("Add a meal you forgot to a past day", "補記之前漏咗嘅餐"),
        tl("1-tap 少甜少底 recipe tweaks", "一撳 少甜少底 改食譜"),
        tl("AI recipes from a link, a photo or your pantry", "AI 由連結、相片或者存貨變出食譜"),
        tl("Scan receipts into your pantry", "掃描收據，直接入存貨"),
        tl("Wet-market unit converter (斤 / 兩)", "街市單位換算（斤 / 兩）"),
      ],
      cta: tl("Make me a regular", "收我做熟客"),
      ctaBg: colors.brand,
      accentColor: colors.brand,
      iconBg: "#F5EBE0",
      cardClass: "border-2 border-brand bg-surface",
      // Owner's choice, 2026-10-18 (was 最抵之選 on the Max card). A factual claim about what
      // subscribers pick, so it should stay true as real subscriptions come in.
      ribbon: tl("Most popular", "最多人揀"),
      successTitle: tl("Welcome, regular!", "歡迎熟客！"),
      successBody: tl(
        "Pro is on. Unlimited photo logs and every nutrient are yours.",
        "Pro 已開通，無限次影相入數同全部營養任你睇。",
      ),
    },
    {
      tier: "max",
      icon: "diamond",
      name: tl("Max", "Max 話事人"),
      persona: tl("The Household Executive", "一家之主"),
      price: "HK$98",
      priceUnit: tl("/ month", "/ 月"),
      priceSub: tl("or HK$828 / year", "或 HK$828 / 年"),
      annualPrice: "HK$828",
      annualUnit: tl("/ year", "/ 年"),
      annualSub: tl("Just HK$69 / month, billed yearly", "折合每月 HK$69，全年結算"),
      pitch: tl("Plan the family's week, with portions for everyone.", "一次過安排全家一週餐單，份量照顧到每個人。"),
      // Each Max line is backed by real code (owner, 2026-10-19 and 2026-10-26): the weekly plan is
      // FamilyPlanScreen + plan-week (pantry first), the portions and 食咗 are utils/weekPlan +
      // log_family_meal (each member's own diary, through the inbox), helper mode is screens/Helper*
      // in en / fil / id, the week's list goes through the same store sheet, the invite cap is
      // FAMILY_MAX_MEMBERS minus the manager's own seat, add/remove is removeMember / revokeInvite, and
      // the member view is FamilyMemberLogScreen (a helper's diary stays private unless she shares it,
      // so the line says "family member"). Members keep their own plan: Max is not shared, so never
      // say they "use one Max account".
      features: [
        tl("Everything in Pro", "Pro 全部功能"),
        tl("A week of family meals, planned with your pantry first", "一週家庭餐單，優先用雪櫃食材"),
        tl(
          "Small, medium or large for each person; tap Eaten once to log everyone's portion in their own diary",
          "每人揀細、中、大份，撳一下「食咗」，全家份量記入各自嘅記錄",
        ),
        tl("Helper mode in English, Filipino or Indonesian", "姐姐煮飯模式：英文、菲律賓文或印尼文"),
        tl(
          `Invite up to ${FAMILY_MAX_MEMBERS - 1} family members or helpers; add or remove any time`,
          `邀請最多 ${FAMILY_MAX_MEMBERS - 1} 位屋企人或工人，隨時加減成員`,
        ),
        tl("See what each family member eats, with nutrients, day by day", "睇到每位屋企人每日食咗乜同營養"),
        // What the tap really does (components/CartExportSheet.tsx, utils/cartExport.ts): lists the
        // recipe's missing ingredients, copies them, opens the store's storefront (none of the three
        // can search a combined list), then a checklist searches that store for one ingredient per
        // tap and ticks it when the shopper comes back. It never adds to a cart, orders or arranges
        // delivery, so never say 落單, 加入購物車 or 送貨 here.
        tl(
          "One shopping list for the week, then search HKTVmall, Wellcome or ParknShop item by item",
          "一張清單買齊成個星期，再逐樣去 HKTVmall、惠康、百佳搵",
        ),
      ],
      cta: tl("Run the household", "話事人上場"),
      ctaBg: colors.accentDark,
      accentColor: colors.accentDark,
      iconBg: "#FBEAC4",
      cardClass: "border-2 border-accent bg-[#FCF3DD]",
      successTitle: tl("You're the boss now", "你係老細"),
      successBody: tl(
        "Max is on. Plan the family's week and search the stores for what you're missing.",
        "Max 已開通，安排全家一週餐單，爭咩材料就去網上超市搵。",
      ),
    },
  ];

  // --- Simulated checkout (web preview + Expo Go) ------------------------------------------
  // No native store here, so we flip the tier locally and celebrate. This is a UX mirror only:
  // it grants nothing a real gate would trust, and it's the path that lets the whole flow be
  // reviewed and tested end to end without an App Store transaction.
  function choose(plan: Plan) {
    if (plan.tier === activeTier) return;
    setTier(plan.tier);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    Alert.alert(plan.successTitle, plan.successBody);
  }

  // --- Ledger-framed failure copy ----------------------------------------------------------
  // Every message stays inside the nutrition-ledger metaphor. Siu Tim Siu Dai keeps a health ledger; it
  // never takes food orders, so nothing here mentions takeout (外賣) or placing an order (落單).
  function showFailure(reason: PurchaseFailure) {
    if (reason === "cancelled") {
      Alert.alert(
        tl("Take your time", "慢慢諗，唔使急"),
        tl(
          "Taking a moment to reconsider? No worries, Boss! The ledger is always open for you. Hope to see you upgrade soon!",
          "手緊諗多兩諗？唔緊要！老細，個記帳簿隨時為你開住，希望好快再見到你升級！",
        ),
      );
    } else if (reason === "network") {
      // A network error here is NOT authoritative. RevenueCat's offline queue retries the receipt and
      // the CustomerInfo listener unlocks the tier on its own once the connection recovers (Apple
      // dedupes the transaction, so there is never a double charge). So this copy stays reassuring and
      // covers both outcomes (still-completing vs. genuinely failed), never a hard "entry failed".
      Alert.alert(
        tl("Network's a bit jammed", "網絡有啲塞"),
        tl(
          "The connection stalled while we confirmed your purchase. If it went through, your plan unlocks automatically once you're back online, with no double charge. If nothing shows up in a minute, tap Restore or try again.",
          "頭先網絡塞咗，未即刻確認到你單購買。如果過咗數，一返到網就會自動幫你解鎖，唔會多收你錢。過一分鐘都仲未見到，就撳「還原購買」或者再試多次。",
        ),
      );
    } else {
      Alert.alert(
        tl("Couldn't settle the bill", "找數搞唔掂"),
        tl(
          "Something tripped up at the counter. No charge was made and your ledger is untouched. Please try again.",
          "找數嗰陣有啲甩轆。冇扣到你錢，記帳簿原封不動，麻煩再試多次。",
        ),
      );
    }
  }

  // --- Live purchase (real RevenueCat build) -----------------------------------------------
  async function runLivePurchase(plan: Plan, option: TierOption) {
    setBusy(true);
    const res = await purchaseSubscription(option.package);
    setBusy(false);
    if (res.ok) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      // The receipt, not the paywall, says whether a trial started, so the end date shown is Apple's.
      Alert.alert(
        plan.successTitle,
        purchaseSuccessBody(plan.successBody, res.trialEndsAt, option.trial, locale, tl),
      );
    } else {
      showFailure(res.reason);
    }
  }

  // Shown when this build ships real billing but the store is unreachable. Plain and factual: the
  // reassuring ledger voice is for things that worked, not for telling someone why they cannot buy.
  function showBillingUnavailable() {
    Alert.alert(
      tl("Subscriptions unavailable", "暫時無法訂閱"),
      tl(
        "We couldn't reach the App Store to load subscription options, so nothing was charged. Check your connection and try again.",
        "暫時無法連接 App Store 載入訂閱選項，未有任何扣費。請檢查網絡連線後再試一次。",
      ),
    );
  }

  // Routing lives in utils/paywallCta.ts so the branch that decides between charging someone,
  // giving them a tier for free, and refusing can be unit tested. See that file for the rule.
  function onCta(plan: Plan, option: TierOption | null) {
    const action = resolvePaywallCta({
      planTier: plan.tier,
      activeTier,
      billingConfigured: isBillingConfigured,
      live,
      hasPurchasablePackage: option !== null,
    });
    if (action === "purchase" && option) runLivePurchase(plan, option);
    else if (action === "unavailable") showBillingUnavailable();
    else if (action === "simulate") choose(plan);
  }

  async function restorePurchases() {
    // Live: ask the App Store account for prior purchases and re-sync the tier from the receipt.
    if (live) {
      setBusy(true);
      const res = await restoreSubscription();
      setBusy(false);
      if (res.ok) {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync().catch(() => {});
        }
        if (res.tier === "free") {
          Alert.alert(
            tl("Nothing to restore", "冇嘢好還原"),
            tl(
              "We checked your App Store account and found no active plan to bring back.",
              "查過你嘅 App Store 戶口，暫時冇進行緊嘅計劃可以還原。",
            ),
          );
        } else {
          Alert.alert(
            tl("Welcome back", "歡迎返嚟"),
            tl(
              "Your plan is restored and your ledger is back in sync.",
              "你嘅計劃已經還原，記帳簿重新同步好晒。",
            ),
          );
        }
      } else {
        showFailure(res.reason);
      }
      return;
    }

    // Real billing, unreachable store. We genuinely do not know whether this account owns a plan,
    // so we must not answer "nothing to restore" - that reads as a verdict on their purchase.
    if (billingUnavailable) {
      Alert.alert(
        tl("Couldn't check your purchases", "暫時查不到購買紀錄"),
        tl(
          "We couldn't reach the App Store to look for previous purchases. Check your connection and try again.",
          "暫時無法連接 App Store 查閱過往的購買紀錄。請檢查網絡連線後再試一次。",
        ),
      );
      return;
    }

    // Simulated: no receipts exist in the demo checkout, so there is nothing to bring back.
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    Alert.alert(
      tl("Nothing to restore yet", "暫時冇嘢還原"),
      tl(
        "This is a demo checkout, so there is no receipt to bring back. Real restore lands when in-app purchases go live.",
        "呢個係示範找數，未有單據可以還原。真正還原會喺應用程式內購買上線時登場。",
      ),
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-row items-start justify-between px-4 pb-1 pt-1">
        <View className="flex-1 pr-3">
          <ScalableText className="text-2xl font-bold text-ink">
            {tl("Pick your table", "揀張枱坐")}
          </ScalableText>
          <ScalableText className="mt-1 text-sm text-ink-muted">
            {tl(
              "From a quick cha chaan teng bite to running the whole household.",
              "由快靚正嘅茶記，到一家之主話晒事。",
            )}
          </ScalableText>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tl("Close", "關閉")}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken active:opacity-70"
        >
          <Ionicons name="close" size={22} color={colors.inkMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 40, gap: 16 }}>
        <View className="flex-row rounded-full bg-surface-sunken p-1">
          {[false, true].map((isAnnual) => {
            const active = annual === isAnnual;
            return (
              <Pressable
                key={String(isAnnual)}
                onPress={() => setAnnual(isAnnual)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-full ${
                  active ? "bg-surface" : ""
                }`}
              >
                <ScalableText className={`text-sm font-bold ${active ? "text-ink" : "text-ink-muted"}`}>
                  {isAnnual ? tl("Annual", "全年") : tl("Monthly", "逐月")}
                </ScalableText>
                {isAnnual ? (
                  <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: colors.jade }}>
                    <ScalableText className="text-[10px] font-bold text-white">
                      {tl("Save 30%", "慳 30%")}
                    </ScalableText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {plans.map((plan) => {
          const isCurrent = plan.tier === activeTier;
          // Prefer live, store-localized pricing when a real offering is loaded; otherwise fall
          // back to the built-in HK$ copy. The annual sub-line is hidden in live mode because its
          // "HK$29 / month" math is hard-coded and wouldn't match a non-HK storefront.
          const pricing =
            plan.tier === "pro" ? offerings?.pro : plan.tier === "max" ? offerings?.max : null;
          const option: TierOption | null = (annual ? pricing?.annual : pricing?.monthly) ?? null;
          const showPrice = option?.priceString ?? (annual ? plan.annualPrice : plan.price);
          const showUnit = annual ? plan.annualUnit : plan.priceUnit;
          const showSub = option ? "" : annual ? plan.annualSub : plan.priceSub;
          // Only set when the store confirmed this person can still get the plan's free trial.
          const trial = option?.trial ?? null;
          return (
            <View key={plan.tier} className={`rounded-2xl p-5 ${plan.cardClass}`}>
              {plan.ribbon ? (
                <View
                  className="absolute -top-3 right-4 rounded-full border border-white px-3 py-1"
                  style={{ backgroundColor: plan.ctaBg }}
                >
                  <ScalableText className="text-xs font-bold" style={{ color: colors.white }}>
                    {plan.ribbon}
                  </ScalableText>
                </View>
              ) : null}

              <View className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: plan.iconBg }}
                >
                  <Ionicons name={plan.icon} size={22} color={plan.accentColor} />
                </View>
                <View className="flex-1">
                  <ScalableText className="text-xl font-bold text-ink">{plan.name}</ScalableText>
                  <ScalableText className="text-xs font-semibold" style={{ color: plan.accentColor }}>
                    {plan.persona}
                  </ScalableText>
                </View>
                {isCurrent ? (
                  <View className="rounded-full bg-surface-sunken px-3 py-1">
                    <ScalableText className="text-xs font-bold text-ink-muted">
                      {tl("Current", "使用中")}
                    </ScalableText>
                  </View>
                ) : null}
              </View>

              <View className="mt-4 flex-row items-baseline gap-1">
                <ScalableText className="text-3xl font-extrabold text-ink">{showPrice}</ScalableText>
                <ScalableText className="text-sm text-ink-muted">{showUnit}</ScalableText>
              </View>
              {showSub ? (
                <ScalableText className="mt-0.5 text-xs text-ink-faint">{showSub}</ScalableText>
              ) : null}
              {/* Apple: the billed amount stays the most prominent price, so the trial sits under
                  it in smaller type, stating its length and what is charged once it ends. */}
              {trial && option ? (
                <ScalableText className="mt-1 text-sm font-semibold" style={{ color: plan.accentColor }}>
                  {trialPriceLine(trial, option.priceString, annual, tl)}
                </ScalableText>
              ) : null}

              <ScalableText className="mt-3 text-sm text-ink-muted">{plan.pitch}</ScalableText>

              <View className="mt-4 gap-2">
                {plan.features.map((f, i) => (
                  <View key={i} className="flex-row items-start gap-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={plan.accentColor}
                      style={{ marginTop: 1 }}
                    />
                    <ScalableText className="flex-1 text-sm text-ink">{f}</ScalableText>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => onCta(plan, option)}
                disabled={isCurrent || busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
                className={`mt-5 min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl px-4 ${
                  isCurrent ? "opacity-60" : "active:opacity-85"
                }`}
                style={{ backgroundColor: isCurrent ? colors.surfaceSunken : plan.ctaBg }}
              >
                <Ionicons
                  name={isCurrent ? "checkmark-done" : plan.tier === "free" ? "cafe" : "sparkles"}
                  size={18}
                  color={isCurrent ? colors.inkMuted : colors.white}
                />
                <ScalableText
                  className="text-base font-bold"
                  style={{ color: isCurrent ? colors.inkMuted : colors.white }}
                >
                  {isCurrent
                    ? tl("You're all set", "你已經搞掂")
                    : trial && plan.tier !== "free"
                      ? trialCta(plan.tier, trial, tl)
                      : plan.cta}
                </ScalableText>
              </Pressable>
            </View>
          );
        })}

        {/* Store unreachable on a build that really does sell subscriptions. Announced rather than
            left to the fine print, because every price on screen is now the built-in HK$ copy
            instead of the user's real App Store pricing. */}
        {billingUnavailable && (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="mt-1 flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
          >
            <Ionicons name="alert-circle-outline" size={18} color={colors.inkMuted} />
            <ScalableText className="flex-1 text-sm text-ink-muted">
              {tl(
                "Couldn't load subscription options. Check your connection and try again.",
                "暫時無法載入訂閱選項。請檢查網絡連線後再試一次。",
              )}
            </ScalableText>
          </View>
        )}

        {/* Order matters: `billingUnavailable` is checked BEFORE `live`, because a session can be
            live yet have no offerings, and in that state the prices on screen are the built-in HK$
            copy. Claiming they are "in your App Store currency" would be a second small lie. */}
        <ScalableText className="px-1 text-center text-xs text-ink-faint">
          {billingUnavailable
            ? tl(
                "Prices in HK$ and may differ from your App Store. Manage or cancel anytime in Settings.",
                "價錢以港幣計，可能與你 App Store 所示不同。隨時可在設定管理或取消。",
              )
            : live
              ? tl(
                  "Prices shown in your App Store currency. Manage or cancel anytime in Settings.",
                  "價錢以你 App Store 所在地貨幣顯示，隨時喺設定管理或取消。",
                )
              : tl(
                  "Prices in HK$. Demo checkout, no real charge. Cancel anytime.",
                  "價錢以港幣計。示範找數，唔會真扣錢，隨時取消。",
                )}
        </ScalableText>

        {/* Billing disclosure, so it stays plain rather than playful. */}
        {trialOnScreen ? (
          <ScalableText className="px-1 text-center text-xs text-ink-faint">
            {tl(
              "Free trials turn into a paid plan when they end. Turn off renewal in Settings at least 24 hours before your trial ends to avoid being charged.",
              "免費試用期結束後會自動轉為收費計劃。如不想被收費，請於試用期結束前最少 24 小時到「設定」關閉自動續訂。",
            )}
          </ScalableText>
        ) : null}

        <Pressable
          onPress={restorePurchases}
          accessibilityRole="button"
          accessibilityLabel={tl("Restore purchases", "還原購買")}
          className="min-h-[44px] items-center justify-center active:opacity-70"
        >
          <ScalableText className="text-sm font-semibold text-brand">
            {tl("Restore purchases", "還原購買")}
          </ScalableText>
        </Pressable>

        {/* Required on any paywall for auto-renewing subscriptions (App Store Guideline 3.1.2). */}
        <LegalLinks align="center" />
      </ScrollView>

      {/* Sync overlay for live purchase / restore. Blankets the sheet with a busy spinner while
          StoreKit and RevenueCat settle the receipt. Absolutely positioned so it covers the
          sheet and swallows taps until the round-trip finishes. */}
      {busy ? (
        <View
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: "rgba(24,20,14,0.45)" }}
          accessibilityViewIsModal
          accessibilityLabel={tl(
            "Synchronizing your healthy quota ledger",
            "同步緊你嘅健康份額記帳簿",
          )}
        >
          <View
            className="items-center gap-3 rounded-2xl bg-surface px-8 py-6"
            style={{ minWidth: 240 }}
          >
            <ActivityIndicator size="large" color={colors.brand} />
            <View className="items-center">
              <ScalableText className="text-center text-base font-bold text-ink">
                同 App Store 對緊數...
              </ScalableText>
              <ScalableText className="mt-1 text-center text-xs text-ink-muted">
                Synchronizing your healthy quota ledger...
              </ScalableText>
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
