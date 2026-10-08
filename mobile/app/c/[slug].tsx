import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ClassDetail } from "@mobile/api/types";
import { Body, Button, Card, Display, Eyebrow, Screen } from "@mobile/components/ui";
import { formatLabel, levelLabel, money, priceLabel, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { swatch, useAppTheme } from "@mobile/theme/theme";

export default function ClassScreen() {
  const { slug, code } = useLocalSearchParams<{ slug: string; code?: string }>();
  const router = useRouter();
  const { api, track, setVertical, attribution } = useSession();
  const { colors, fonts } = useAppTheme();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const promo = (typeof code === "string" && code) || (attribution && "code" in attribution ? attribution.code : null);

  useEffect(() => {
    if (!slug) return;
    void api.classDetail(slug).then((next) => {
      setDetail(next);
      setVertical(next.vertical);
      void track("class_view", { slug: next.slug, vertical: next.vertical });
    }).catch(() => setMissing(true));
  }, [api, setVertical, slug, track]);

  if (missing) return <Screen><Body>That class is not on BeCreative.</Body></Screen>;
  if (!detail) return <Screen><Body>Loading class…</Body></Screen>;
  const price = priceLabel(detail.pricePerSessionCents, detail.pricePerSeriesCents);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen testID="class-screen">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent }}>Back</Text>
        </Pressable>
        <View style={{ height: 180, borderRadius: 28, backgroundColor: swatch(detail.coverHue, detail.vertical), justifyContent: "flex-end", padding: 18 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 36, color: "#fbf8f3" }}>{detail.title}</Text>
        </View>
        <Eyebrow>{detail.categoryName} · {levelLabel(detail.skillLevel)}</Eyebrow>
        <Display testID="class-title">{detail.title}</Display>
        <Pressable accessibilityRole="link" accessibilityLabel={`Teacher ${detail.teacher.studioName}`} onPress={() => router.push(`/t/${detail.teacher.slug}`)}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent, fontSize: 18 }}>{detail.teacher.studioName}</Text>
        </Pressable>
        <Body>{detail.description}</Body>
        <Card>
          <Body>{formatLabel(detail.format)} · {detail.durationMinutes} min</Body>
          <Body>{detail.delivery === "virtual" ? "Virtual" : detail.location?.neighborhood ?? "Los Angeles"} · up to {detail.maxSize}</Body>
          <Body>{detail.firstClassFree ? "First class free, once per teacher." : price}</Body>
          {detail.outcomes ? <Body>You leave able to {detail.outcomes}</Body> : null}
          {detail.whatToBring ? <Body muted>Bring {detail.whatToBring}</Body> : null}
        </Card>
        {(detail.sessions[0] || detail.slots[0]) ? <Body muted>Next {whenLabel((detail.sessions[0] ?? detail.slots[0]).startsAt)}</Body> : null}
        {detail.reviews.map((review) => (
          <Card key={review.id}>
            <Body>{"★".repeat(review.rating)}</Body>
            <Body>{review.body}</Body>
            <Body muted>{review.author}</Body>
          </Card>
        ))}
        <Button label="Share" tone="ghost" onPress={() => void Share.share({ message: `${detail.title} with ${detail.teacher.studioName} on BeCreative`, url: `https://classes.becreative.app/c/${detail.slug}` })} />
        <Button label={detail.pricePerSessionCents === 0 ? "Reserve a free seat" : `Book · ${money(detail.pricePerSessionCents ?? detail.pricePerSeriesCents ?? 0)}`} onPress={() => router.push({ pathname: "/book/[slug]", params: { slug: detail.slug, code: promo ?? "" } })} testID="book-class" />
      </Screen>
    </SafeAreaView>
  );
}
