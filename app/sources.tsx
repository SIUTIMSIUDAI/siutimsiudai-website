import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { Card } from "@/components/Card";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { CITATIONS, CITATION_TOPICS, citationUrl, type Citation } from "@/constants/citations";

// Where our numbers come from.
//
// This screen exists to satisfy App Store Guideline 1.4.1: an app that presents health or medical
// information must cite its sources, and the citations must be easy for the user to find. Version
// 1.0 (13) was rejected for having none. Every health surface in the app links here.
//
// Two things matter for review and must not be quietly dropped:
//   1. Each row states what the source justifies IN THIS APP, not just the source's own title. A
//      bare list of links reads as decoration; "this is where your protein target comes from" reads
//      as a citation.
//   2. The links open for real, in an in-app browser. A reviewer will tap them.

function SourceRow({ citation }: { citation: Citation }) {
  const { locale, tl } = useLocale();
  const url = citationUrl(citation, locale);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tl(citation.title, citation.titleZh)}
      accessibilityHint={tl("Opens the source in a browser", "喺瀏覽器開啟資料來源")}
      onPress={() => {
        WebBrowser.openBrowserAsync(url).catch(() => {});
      }}
      className="min-h-[44px] flex-row items-start gap-3 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-1">
        <ScalableText className="text-base font-semibold text-brand underline">
          {tl(citation.title, citation.titleZh)}
        </ScalableText>
        <ScalableText className="text-xs text-ink-muted">
          {tl(citation.publisher, citation.publisherZh)}
        </ScalableText>
        <ScalableText className="mt-1 text-sm text-ink">
          {tl(citation.backs, citation.backsZh)}
        </ScalableText>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.brand} style={{ marginTop: 2 }} />
    </Pressable>
  );
}

export default function SourcesScreen() {
  const { tl } = useLocale();

  return (
    <Screen>
      <View className="flex-row items-center px-2 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Back", "返回")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70"
        >
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 48, gap: 16 }}>
        <View className="gap-1">
          <ScalableText className="text-2xl font-bold text-ink">
            {tl("Where our numbers come from", "我們的數字從何而來")}
          </ScalableText>
          <ScalableText className="text-sm text-ink-muted">
            {tl(
              "Every target and suggestion in this app is based on published guidance. Tap any source to read it in full.",
              "app 內每個目標同建議都根據已公開的指引。㩒任何一項就可以睇原文。",
            )}
          </ScalableText>
        </View>

        {/* Deliberately at the TOP, not buried at the bottom. This app estimates; it does not
            diagnose, and it does not know about anyone's medical conditions or medication. */}
        <Card className="border-[#D8CDB6] bg-surface-subtle">
          <View className="flex-row items-start gap-3">
            <Ionicons name="information-circle-outline" size={20} color={colors.ink} />
            <ScalableText className="flex-1 text-sm text-ink">
              {tl(
                "These figures are general estimates, not medical advice. They cannot account for a medical condition, a medication, a pregnancy, or an allergy. If you are managing a health condition or changing your diet significantly, speak to a doctor or a registered dietitian first.",
                "呢啲數字係一般估算，並非醫療建議，無法考慮個別病症、藥物、懷孕或過敏情況。如果你正處理健康問題，或者想大幅改變飲食，請先諮詢醫生或註冊營養師。",
              )}
            </ScalableText>
          </View>
        </Card>

        {CITATION_TOPICS.map(({ topic, label, labelZh }) => {
          const rows = CITATIONS.filter((c) => c.topic === topic);
          if (rows.length === 0) return null;
          return (
            <View key={topic} className="gap-2">
              <ScalableText className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {tl(label, labelZh)}
              </ScalableText>
              <Card className="py-0">
                {rows.map((citation, i) => (
                  <View
                    key={citation.key}
                    className={i > 0 ? "border-t border-[#EFE7D8]" : undefined}
                  >
                    <SourceRow citation={citation} />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
