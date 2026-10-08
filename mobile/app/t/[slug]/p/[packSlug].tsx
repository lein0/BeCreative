import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { TeacherProfile } from "@mobile/api/types";
import { Body, Button, Display, Screen } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";

export default function PackLink() {
  const { slug, packSlug, code } = useLocalSearchParams<{ slug: string; packSlug: string; code?: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  useEffect(() => {
    if (slug) void api.teacher(slug).then(setProfile);
  }, [api, slug]);
  const pack = profile?.packs.find((item) => item.slug === packSlug);
  return (
    <Screen>
      <Display>{pack?.name ?? "Pack"}</Display>
      <Body>{pack?.description}</Body>
      <Body>{pack ? money(pack.priceCents) : ""}</Body>
      {typeof code === "string" && code ? <Body muted>Promo {code} is saved for checkout on the web. Pack purchase in the app arrives with the live API.</Body> : null}
      <Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
