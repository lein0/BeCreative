import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ClassDetail } from "@mobile/api/types";
import { Body, Button, Card, Display, Eyebrow, Screen } from "@mobile/components/ui";
import { money, whenLabel } from "@mobile/format";
import { classCtaLabel } from "@mobile/experiments";
import { useSession } from "@mobile/session";
import { swatch, useAppTheme } from "@mobile/theme/theme";

function hueOf(slug: string) {
  return [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export default function ClassScreen() {
  const { slug, code } = useLocalSearchParams<{ slug: string; code?: string }>();
  const router = useRouter();
  const { api, track, setVertical, attribution, assignments } = useSession();
  const { colors, fonts } = useAppTheme();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const promo = (typeof code === "string" && code) || (attribution && "code" in attribution ? attribution.code : null);

  useEffect(() => {
    if (!slug) return;
    void api.classDetail(slug).then((next) => {
      setDetail(next);
      if (next.class.vertical === "creative" || next.class.vertical === "wellness") setVertical(next.class.vertical);
      void track("class_viewed", { slug: next.class.slug, vertical: next.class.vertical ?? "" });
    }).catch(() => setMissing(true));
  }, [api, setVertical, slug, track]);

  if (missing) return <Screen><Body>That class is not on BeCreative.</Body></Screen>;
  if (!detail) return <Screen><Body>Loading class…</Body></Screen>;
  const price = detail.class.priceCents ?? 0;
  const label = classCtaLabel(assignments, price === 0 ? "Reserve a free seat" : `Book · ${money(price)}`);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen testID="class-screen">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent }}>Back</Text>
        </Pressable>
        <View style={{ height: 180, borderRadius: 28, backgroundColor: swatch(hueOf(detail.class.slug), detail.class.vertical === "wellness" ? "wellness" : "creative"), justifyContent: "flex-end", padding: 18 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 36, color: "#fbf8f3" }}>{detail.class.title}</Text>
        </View>
        <Eyebrow>{detail.class.category || detail.class.delivery}</Eyebrow>
        <Display testID="class-title">{detail.class.title}</Display>
        <Pressable accessibilityRole="link" accessibilityLabel={`Teacher ${detail.teacher.name}`} onPress={() => router.push(`/t/${detail.teacher.slug}`)}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent, fontSize: 18 }}>{detail.teacher.name}</Text>
        </Pressable>
        <Body>{detail.description}</Body>
        <Card>
          <Body>{detail.class.delivery === "virtual" ? "Virtual" : "In person"}</Body>
          <Body>{price === 0 ? "Free" : money(price)}</Body>
          {detail.slots[0] ? <Body muted>Next {whenLabel(detail.slots[0].startsAt)}</Body> : null}
        </Card>
        <Button label="Share" tone="ghost" onPress={() => void Share.share({ message: `${detail.class.title} with ${detail.teacher.name} on BeCreative`, url: `https://classes.becreative.app/c/${detail.class.slug}` })} />
        <Button label={label} onPress={() => router.push({ pathname: "/book/[slug]", params: { slug: detail.class.slug, code: promo ?? "" } })} testID="book-class" />
      </Screen>
    </SafeAreaView>
  );
}
