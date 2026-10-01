import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Button } from "@/components/Button";
import { UnitToggle } from "@/components/UnitToggle";
import { HealthProfileSheet } from "@/components/HealthProfileSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/Avatar";
import { ActionSheet, type ActionSheetOption } from "@/components/ActionSheet";
import { NameDialog } from "@/components/NameDialog";
import { LegalLinks } from "@/components/LegalLinks";
import { SourcesLink } from "@/components/SourcesLink";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useBiometricLogin } from "@/hooks/useBiometricLogin";
import { getMyDisplayName, setMyDisplayName } from "@/services/profileService";
import { getMyAvatarUrl, removeMyAvatar, saveMyAvatar } from "@/services/avatarService";
import { normaliseDisplayName } from "@/utils/displayName";
import { pickImageBase64 } from "@/utils/pickImageBase64";
import * as biometricAuth from "@/services/biometricAuth";
import { biometricNameKey } from "@/utils/biometricLogin";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { useNutritionStore } from "@/stores/nutritionStore";
import { SubscriptionTier, useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { computeNutritionTargets } from "@/utils/nutritionTargets";
import { hasPasswordIdentity, socialProviderNames } from "@/utils/authIdentity";
import { HealthProfile, Locale } from "@/types";

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

export default function ProfileScreen() {
  const { t, tl } = useLocale();
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const system = useAppStore((s) => s.measurementSystem);
  const setMeasurementSystem = useAppStore((s) => s.setMeasurementSystem);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const tier = useSubscriptionStore((s) => s.activeTier);

  const target = useNutritionStore((s) => s.dailyCalorieTarget);
  const setCalorieTarget = useNutritionStore((s) => s.setCalorieTarget);
  const healthProfile = useNutritionStore((s) => s.healthProfile);
  const setHealthProfile = useNutritionStore((s) => s.setHealthProfile);
  const clearHealthProfile = useNutritionStore((s) => s.clearHealthProfile);
  const [targetText, setTargetText] = useState(String(target));
  // The name family members see, shown at the top in place of "Signed in" and changed in NameDialog.
  // Null until loaded, or when none is set ("Add your name").
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [healthSheetOpen, setHealthSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  // The profile photo: a signed link (null for none), whether a save or removal is running, and which
  // of the two failed so the right message shows.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<"save" | "remove" | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

  const session = useAuthStore((s) => s.session);
  const biometric = useBiometricLogin();
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState(false);
  const biometricName = t(biometricNameKey(biometric.capability.kind));

  // Only offered where it can actually work: a sensor with something enrolled, and a live session
  // to take a refresh token from. On a device with no enrolled face the row is hidden rather than
  // disabled, because a greyed-out switch invites the user to hunt for the reason in our settings
  // when the fix is in the iOS ones.
  const canOfferBiometric = biometric.ready && biometric.capability.available && session !== null;

  async function toggleBiometric(next: boolean) {
    setBiometricError(false);
    setBiometricBusy(true);
    if (next) {
      // Turning this on asks for the face or finger first, so the user proves it is them before a
      // token is stored and gets to see the thing they just enabled actually work.
      const res = session
        ? await biometricAuth.enable(
            session,
            t("auth.biometricEnablePrompt", { method: biometricName }),
            t("auth.biometricEnableCancel"),
          )
        : { ok: false as const, failure: "unknown" as const };
      // Dismissing the prompt is a decision. The switch springs back on reload because nothing was
      // written, and saying anything here would be telling the user off for changing their mind.
      if (!res.ok && res.failure !== "cancelled") setBiometricError(true);
    } else {
      await biometricAuth.disable();
    }
    await biometric.reload();
    setBiometricBusy(false);
  }

  const targets = healthProfile ? computeNutritionTargets(healthProfile) : null;

  // An Apple or Google account has no password to change. Rather than hide the row and leave the
  // user hunting for a setting that is not there, we show why: silence reads as a missing feature,
  // and this way nobody files "your app has no change password option".
  const canChangePassword = hasPasswordIdentity(user?.identities);
  const socialNames = socialProviderNames(user?.identities);

  // Load the saved name once for the heading. A signed-out or unconfigured session resolves to null,
  // which shows "Add your name".
  useEffect(() => {
    let active = true;
    void getMyDisplayName().then((saved) => {
      if (active) setDisplayName(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  // Load the photo once, like the name above. No photo, signed out or no backend all resolve to null,
  // which shows the person icon.
  useEffect(() => {
    let active = true;
    void getMyAvatarUrl().then((url) => {
      if (active) setAvatarUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  async function changeAvatar() {
    setAvatarError(null);
    const picked = await pickImageBase64("library", { square: true });
    // Backing out of the picker is a decision, not a failure.
    if (picked.status === "cancel") return;
    if (picked.status !== "ok") {
      setAvatarError("save");
      return;
    }
    setAvatarBusy(true);
    const result = await saveMyAvatar(picked.base64);
    setAvatarBusy(false);
    if (result.ok) setAvatarUrl(result.url);
    else setAvatarError("save");
  }

  // Chosen from the photo menu, which is itself the confirmation, so it removes straight away.
  async function removeAvatar() {
    setAvatarError(null);
    setAvatarBusy(true);
    const result = await removeMyAvatar();
    setAvatarBusy(false);
    if (result.ok) setAvatarUrl(null);
    else setAvatarError("remove");
  }

  function commitTarget() {
    const next = Math.max(0, Math.round(Number(targetText) || 0)) || 2000;
    setCalorieTarget(next);
    setTargetText(String(next));
  }

  // Saved from NameDialog. The heading shows exactly what was stored (trimmed, capped), and saving an
  // empty name clears it back to "Add your name".
  async function saveName(text: string): Promise<boolean> {
    const clean = normaliseDisplayName(text);
    const res = await setMyDisplayName(clean);
    if (res.ok) setDisplayName(clean);
    return res.ok;
  }

  // Remove is offered only when there is a photo to remove.
  const photoOptions: ActionSheetOption[] = [
    {
      label: tl("Choose from photo library", "喺相簿揀相"),
      icon: "images-outline",
      onPress: () => void changeAvatar(),
    },
    ...(avatarUrl
      ? [
          {
            label: tl("Remove profile photo", "移除頭像"),
            icon: "trash-outline" as const,
            destructive: true,
            onPress: () => void removeAvatar(),
          },
        ]
      : []),
  ];

  function handleHealthSaved(profile: HealthProfile) {
    setHealthProfile(profile);
    // Push the freshly calculated goal straight into the daily target the log page reads, so
    // the calorie ring updates immediately instead of waiting for a second manual save.
    const calculated = computeNutritionTargets(profile).calories;
    setCalorieTarget(calculated);
    setTargetText(String(calculated));
  }

  async function confirmDelete() {
    setDeleteOpen(false);
    setDeleting(true);
    setDeleteError(false);
    const outcome = await deleteAccount();
    // On success the session clears and the route gate navigates away from the tabs, unmounting
    // this screen, so only the failure path needs handling here.
    if (!outcome.ok) {
      setDeleting(false);
      setDeleteError(true);
    }
  }

  const LANGS: { code: Locale; label: string }[] = [
    { code: "en", label: t("profile.english") },
    { code: "zh-Hant", label: t("profile.chinese") },
  ];

  const TIER_INFO: Record<
    SubscriptionTier,
    { name: string; persona: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
  > = {
    free: {
      name: tl("Free", "免費"),
      persona: tl("The Casual Eater", "街坊食客"),
      icon: "cafe",
      color: colors.inkMuted,
      bg: colors.surfaceSunken,
    },
    pro: {
      name: tl("Pro", "Pro 熟客"),
      persona: tl("The Healthy Foodie", "識食健康派"),
      icon: "star",
      color: colors.brand,
      bg: "#F5EBE0",
    },
    max: {
      name: tl("Max", "Max 話事人"),
      persona: tl("The Household Executive", "一家之主"),
      icon: "diamond",
      color: colors.accentDark,
      bg: "#FBEAC4",
    },
  };
  const currentTier = TIER_INFO[tier];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 20 }}>
        <ScalableText className="text-2xl font-bold text-ink">{t("profile.title")}</ScalableText>

        <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tl("Profile photo options", "頭像選項")}
              disabled={avatarBusy}
              onPress={() => setPhotoMenuOpen(true)}
              className="active:opacity-70"
            >
              <Avatar uri={avatarUrl} size={48} fallbackIcon="person" />
              {/* A small camera badge says the circle can be tapped. */}
              <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-ink">
                <Ionicons name="camera" size={10} color="#FFFFFF" />
              </View>
              {avatarBusy ? (
                <View className="absolute inset-0 items-center justify-center rounded-full bg-black/30">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
            {/* The name family members see, in place of "Signed in". Tapping anywhere here edits it. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                displayName ? tl("Change your name", "更改名稱") : tl("Add your name", "填你個名")
              }
              onPress={() => setNameDialogOpen(true)}
              className="min-h-[44px] flex-1 justify-center active:opacity-70"
            >
              <View className="flex-row items-center gap-1.5">
                <ScalableText
                  className={`shrink text-base font-bold ${displayName ? "text-ink" : "text-ink-muted"}`}
                  numberOfLines={1}
                >
                  {displayName ?? tl("Add your name", "填你個名")}
                </ScalableText>
                <Ionicons name="pencil" size={14} color={colors.inkMuted} />
              </View>
              <ScalableText className="text-xs text-ink-muted" numberOfLines={1}>
                {user?.email ?? tl("Synced to your account", "已同步到你的帳戶")}
              </ScalableText>
            </Pressable>
          </View>
          {avatarError ? (
            <ScalableText className="text-xs text-[#C0392B]">
              {avatarError === "save"
                ? tl(
                    "Your photo could not be saved. Please check your connection and try again.",
                    "未能儲存頭像，請檢查網絡後再試。",
                  )
                : tl(
                    "Your photo could not be removed. Please check your connection and try again.",
                    "未能移除頭像，請檢查網絡後再試。",
                  )}
            </ScalableText>
          ) : null}
          {canChangePassword ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("auth.changeTitle")}
              onPress={() => router.push("/account/password")}
              className="min-h-[44px] flex-row items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2.5 active:opacity-70"
            >
              <Ionicons name="key-outline" size={18} color={colors.inkMuted} />
              <ScalableText className="flex-1 text-sm font-semibold text-ink">
                {t("auth.changeTitle")}
              </ScalableText>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </Pressable>
          ) : (
            socialNames.length > 0 && (
              <View className="flex-row items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2.5">
                <Ionicons name="key-outline" size={18} color={colors.inkFaint} />
                <ScalableText className="flex-1 text-xs text-ink-muted">
                  {t("auth.managedBySocial", { provider: socialNames.join(" / ") })}
                </ScalableText>
              </View>
            )
          )}
          {canOfferBiometric && (
            <View className="gap-2 rounded-xl bg-surface-sunken px-3 py-2.5">
              <View className="min-h-[44px] flex-row items-center gap-3">
                <Ionicons name="scan-outline" size={18} color={colors.inkMuted} />
                <View className="flex-1">
                  <ScalableText className="text-sm font-semibold text-ink">
                    {t("auth.biometricToggle", { method: biometricName })}
                  </ScalableText>
                  <ScalableText className="text-xs text-ink-muted">
                    {t("auth.biometricToggleBody", { method: biometricName })}
                  </ScalableText>
                </View>
                {biometricBusy ? (
                  <ActivityIndicator color={colors.inkMuted} />
                ) : (
                  <Switch
                    value={biometric.enabled}
                    onValueChange={(next) => {
                      void toggleBiometric(next);
                    }}
                    trackColor={{ false: colors.surfaceSunken, true: colors.brand }}
                    accessibilityLabel={t("auth.biometricToggle", { method: biometricName })}
                  />
                )}
              </View>
              {biometricError && (
                <ScalableText className="text-xs text-[#C0392B]">
                  {t("auth.biometricEnableFailed", { method: biometricName })}
                </ScalableText>
              )}
            </View>
          )}
        </View>

        <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: currentTier.bg }}
            >
              <Ionicons name={currentTier.icon} size={22} color={currentTier.color} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <ScalableText className="text-base font-bold text-ink">{currentTier.name}</ScalableText>
                {tier !== "free" && (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: currentTier.color }}>
                    <ScalableText className="text-[10px] font-bold text-white">
                      {tl("ACTIVE", "開通中")}
                    </ScalableText>
                  </View>
                )}
              </View>
              <ScalableText className="text-xs text-ink-muted">{currentTier.persona}</ScalableText>
            </View>
          </View>
          <Button
            label={tier === "free" ? tl("See plans", "睇下計劃") : tl("Manage plan", "管理計劃")}
            icon={tier === "free" ? "sparkles" : "settings-outline"}
            variant={tier === "free" ? "primary" : "secondary"}
            onPress={() => router.push("/subscription")}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("family.title")}
          onPress={() => router.push("/family/invite")}
          className="flex-row items-center gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4 active:opacity-70"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#F5EBE0" }}>
            <Ionicons name="people" size={22} color={colors.brand} />
          </View>
          <View className="flex-1">
            <ScalableText className="text-base font-bold text-ink">{t("family.title")}</ScalableText>
            <ScalableText className="text-xs text-ink-muted" numberOfLines={2}>
              {tier === "max"
                ? tl("Invite and manage family members.", "邀請及管理家庭成員。")
                : t("family.maxOnly")}
            </ScalableText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
        </Pressable>

        <View className="gap-2">
          <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
            {t("profile.language")}
          </ScalableText>
          <View className="flex-row gap-2">
            {LANGS.map((l) => {
              const active = l.code === locale;
              return (
                <Pressable
                  key={l.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLocale(l.code)}
                  className={`min-h-[44px] flex-1 items-center justify-center rounded-xl ${
                    active ? "bg-ink" : "bg-surface-sunken"
                  }`}
                >
                  <ScalableText
                    className={`text-sm font-semibold ${active ? "text-white" : "text-ink-muted"}`}
                  >
                    {l.label}
                  </ScalableText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
            {t("recipes.units")}
          </ScalableText>
          <UnitToggle value={system} onChange={setMeasurementSystem} />
        </View>

        <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-sunken">
              <Ionicons name="fitness" size={22} color={colors.inkMuted} />
            </View>
            <View className="flex-1">
              <ScalableText className="text-base font-bold text-ink">{t("health.title")}</ScalableText>
              <ScalableText className="text-xs text-ink-muted">
                {targets ? t("health.subtitle") : t("health.summaryUnset")}
              </ScalableText>
            </View>
          </View>

          {targets && (
            <View className="gap-1">
              <View className="flex-row items-baseline gap-2">
                <ScalableText className="text-2xl font-bold text-ink">{targets.calories}</ScalableText>
                <ScalableText className="text-sm text-ink-muted">{tl("kcal / day", "千卡 / 日")}</ScalableText>
              </View>
              <ScalableText className="text-sm text-ink-muted">
                {t("health.protein")} {targets.protein}g · {t("health.carbs")} {targets.carbs}g ·{" "}
                {t("health.fat")} {targets.fat}g · {t("health.fibre")} {targets.fiber}g
              </ScalableText>
            </View>
          )}

          <Button
            label={targets ? t("health.edit") : t("health.setup")}
            icon={targets ? "create-outline" : "calculator-outline"}
            variant={targets ? "secondary" : "primary"}
            onPress={() => setHealthSheetOpen(true)}
          />

          {/* Settings is where someone goes looking for the "why" behind a number they disagree
              with, so the citations live in the same card as the targets themselves. */}
          <SourcesLink variant="row" />
        </View>

        <View className="gap-2">
          <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
            {t("profile.calorieTarget")}
          </ScalableText>
          <View className="flex-row items-center gap-2">
            <TextInput
              className={`${INPUT} flex-1`}
              value={targetText}
              onChangeText={setTargetText}
              onEndEditing={commitTarget}
              keyboardType="number-pad"
              placeholderTextColor={colors.inkFaint}
            />
            <ScalableText className="text-sm text-ink-muted">{tl("kcal", "千卡")}</ScalableText>
            <Button label={t("common.save")} onPress={commitTarget} />
          </View>
        </View>

        <View className="flex-row items-center gap-2 rounded-2xl bg-surface-sunken p-3">
          <Ionicons name="text" size={18} color={colors.inkMuted} />
          <ScalableText className="flex-1 text-xs text-ink-muted">{t("profile.textSize")}</ScalableText>
        </View>

        <View className="gap-2">
          <ScalableText className="px-1 text-sm font-semibold text-ink-muted">
            {tl("Legal", "法律資訊")}
          </ScalableText>
          <View className="rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-3">
            <LegalLinks align="start" />
          </View>
        </View>

        {/* Account exits sit together at the end, with the permanent one last. */}
        <Button
          label={tl("Sign out", "登出")}
          icon="log-out-outline"
          variant="secondary"
          onPress={() => {
            void signOut();
          }}
        />

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tl("Delete account", "刪除帳戶")}
            disabled={deleting}
            onPress={() => setDeleteOpen(true)}
            className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-[#E4DCCB] px-4 py-3 active:opacity-70 ${
              deleting ? "opacity-50" : ""
            }`}
          >
            {deleting ? (
              <ActivityIndicator color="#C2554B" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#C2554B" />
            )}
            <ScalableText className="text-base font-semibold" style={{ color: "#C2554B" }}>
              {tl("Delete account", "刪除帳戶")}
            </ScalableText>
          </Pressable>
          {deleteError ? (
            <ScalableText className="px-1 text-xs" style={{ color: "#C2554B" }}>
              {tl(
                "Something went wrong. Please check your connection and try again.",
                "發生錯誤，請檢查網絡後再試。",
              )}
            </ScalableText>
          ) : (
            <ScalableText className="px-1 text-xs text-ink-faint">
              {tl(
                "Permanently deletes your account and saved data.",
                "永久刪除你的帳戶及已儲存資料。",
              )}
            </ScalableText>
          )}
        </View>

        {/* Dev-only: replay the whole first-run flow for testing and demos. Clearing the saved
            health profile makes the route gate pass back through profile-setup instead of skipping
            it, so onboarding -> profile-setup -> app all show. __DEV__ is false in production
            builds, so this row never ships to the public. Safe to delete anytime. */}
        {__DEV__ && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              resetOnboarding();
              clearHealthProfile();
              router.replace("/onboarding");
            }}
            className="min-h-[44px] flex-row items-center gap-2 rounded-2xl border border-dashed border-[#E4DCCB] p-3 active:opacity-70"
          >
            <Ionicons name="refresh" size={18} color={colors.inkMuted} />
            <ScalableText className="flex-1 text-xs text-ink-muted">
              Replay first run (dev only)
            </ScalableText>
          </Pressable>
        )}
      </ScrollView>

      <HealthProfileSheet
        visible={healthSheetOpen}
        initial={healthProfile}
        onClose={() => setHealthSheetOpen(false)}
        onSaved={handleHealthSaved}
      />
      <ActionSheet
        visible={photoMenuOpen}
        options={photoOptions}
        onClose={() => setPhotoMenuOpen(false)}
      />
      <NameDialog
        visible={nameDialogOpen}
        initial={displayName}
        onSave={saveName}
        onClose={() => setNameDialogOpen(false)}
      />
      <ConfirmDialog
        visible={deleteOpen}
        title={tl("Delete your account?", "確認刪除帳戶？")}
        message={tl(
          "This permanently deletes your account and your saved data. This cannot be undone.",
          "此操作會永久刪除你的帳戶及已儲存資料，無法復原。",
        )}
        confirmLabel={tl("Delete account", "刪除帳戶")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </Screen>
  );
}
