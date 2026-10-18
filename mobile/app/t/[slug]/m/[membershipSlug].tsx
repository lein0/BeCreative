import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { TeacherProfile } from "@mobile/api/types";
import { Body, Button, Display, Screen } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";

export default function MembershipLink() {
  const { slug, membershipSlug } = useLocalSearchParams<{ slug: string; membershipSlug: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  useEffect(() => {
    if (slug) void api.teacher(slug).then(setProfile);
  }, [api, slug]);
  const plan = profile?.memberships.find((item) => item.slug === membershipSlug);
  return (
    <Screen>
      <Display>{plan?.name ?? "Membership"}</Display>
      <Body>{plan?.description}</Body>
      <Body>{plan ? `${money(plan.priceCents)} / ${plan.termMonths} mo` : ""}</Body>
      <Body muted>{plan?.pauseCancelPolicy}</Body>
      <Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
