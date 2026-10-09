import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TeacherProfile } from "@mobile/api/types";
import { Body, Button, Display, Screen } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function TeacherScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { api } = useSession();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!slug) return;
    void api.teacher(slug).then(setProfile).catch(() => setMissing(true));
  }, [api, slug]);
  if (missing) return <Screen><Body>That teacher is not on BeCreative.</Body></Screen>;
  if (!profile) return <Screen><Body>Loading teacher…</Body></Screen>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen>
        <Button label="Back" tone="ghost" onPress={() => router.back()} />
        <Display>{profile.teacher.name}</Display>
        <Body>{profile.teacher.bio}</Body>
        <Button label="Link in bio" tone="ghost" onPress={() => router.push(`/t/${profile.teacher.slug}/bio`)} />
        <View style={{ gap: 12 }}>
          {profile.classes.map((item) => (
            <Button key={item.id} label={item.title} onPress={() => router.push(`/c/${item.slug}`)} />
          ))}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
