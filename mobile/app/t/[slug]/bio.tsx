import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { TeacherProfile } from "@mobile/api/types";
import { Body, Button, Display, Screen } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function Bio() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  useEffect(() => {
    if (slug) void api.teacher(slug).then(setProfile).catch(() => undefined);
  }, [api, slug]);
  if (!profile) return <Screen><Body>Loading…</Body></Screen>;
  return (
    <Screen>
      <Display>{profile.teacher.name}</Display>
      <Body>{profile.teacher.bio}</Body>
      <View style={{ gap: 8 }}>
        {profile.classes.map((item) => (
          <Button key={item.id} label={item.title} onPress={() => router.push(`/c/${item.slug}`)} />
        ))}
      </View>
    </Screen>
  );
}
