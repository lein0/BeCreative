import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TeacherProfile } from "@mobile/api/types";
import { ClassCardView } from "@mobile/components/ClassCardView";
import { Body, Button, Display, Screen } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function TeacherScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { api, setVertical } = useSession();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  useEffect(() => {
    if (!slug) return;
    void api.teacher(slug).then((next) => {
      setProfile(next);
      setVertical(next.vertical);
    });
  }, [api, setVertical, slug]);
  if (!profile) return <Screen><Body>Loading teacher…</Body></Screen>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen>
        <Button label="Back" tone="ghost" onPress={() => router.back()} />
        <Display>{profile.studioName}</Display>
        <Body>{profile.bio}</Body>
        <Body muted>{profile.neighborhood}</Body>
        <Button label="Link in bio" tone="ghost" onPress={() => router.push(`/t/${profile.slug}/bio`)} />
        {profile.packs.map((pack) => (
          <Button key={pack.id} label={`${pack.name} · ${money(pack.priceCents)}`} tone="ghost" onPress={() => router.push(`/t/${profile.slug}/p/${pack.slug}`)} />
        ))}
        {profile.memberships.map((plan) => (
          <Button key={plan.id} label={`${plan.name} · ${money(plan.priceCents)}`} tone="ghost" onPress={() => router.push(`/t/${profile.slug}/m/${plan.slug}`)} />
        ))}
        <View style={{ gap: 12 }}>
          {profile.classes.map((item) => (
            <ClassCardView key={item.id} item={item} onPress={() => router.push(`/c/${item.slug}`)} />
          ))}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
