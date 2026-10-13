import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Display, Screen } from "@mobile/components/ui";

export default function MembershipLink() {
  const { slug } = useLocalSearchParams<{ slug: string; membershipSlug: string }>();
  const router = useRouter();
  return (
    <Screen>
      <Display>Membership</Display>
      <Body>Memberships renew, so they open a Checkout Session in the browser and return to this app at becreative://bookings. The teacher profile lists classes, not the membership id that purchase needs.</Body>
      <Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
