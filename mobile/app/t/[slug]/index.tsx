import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { MembershipOffer, PackOffer, TeacherProfile } from "@mobile/api/types";
import { openCheckoutSession } from "@mobile/checkout/browser";
import { startMembershipCheckout, startPackCheckout } from "@mobile/checkout/offer";
import { Body, Button, Card, Display, Notice, Screen, Title } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function TeacherScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { api, user } = useSession();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    void api.teacher(slug).then(setProfile).catch(() => setMissing(true));
  }, [api, slug]);

  async function buyPack(offer: PackOffer) {
    if (!user) {
      router.push("/login");
      return;
    }
    setBusyId(offer.id);
    setError(null);
    try {
      const result = await startPackCheckout(api, offer);
      if (result.checkoutUrl && !result.clientSecret) {
        await openCheckoutSession(result.checkoutUrl);
        router.push("/bookings");
        return;
      }
      router.push("/checkout");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start that pack.");
    } finally {
      setBusyId(null);
    }
  }

  async function buyMembership(offer: MembershipOffer) {
    if (!user) {
      router.push("/login");
      return;
    }
    setBusyId(offer.id);
    setError(null);
    try {
      const result = await startMembershipCheckout(api, offer);
      if (result.checkoutUrl) {
        await openCheckoutSession(result.checkoutUrl);
        router.push("/bookings");
        return;
      }
      router.push("/checkout");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start that membership.");
    } finally {
      setBusyId(null);
    }
  }

  if (missing) return <Screen><Body>That teacher is not on BeCreative.</Body></Screen>;
  if (!profile) return <Screen><Body>Loading teacher…</Body></Screen>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen testID="teacher-screen">
        <Button label="Back" tone="ghost" onPress={() => router.back()} />
        <Display testID="teacher-name">{profile.teacher.name}</Display>
        <Body>{profile.teacher.bio}</Body>
        <Button label="Link in bio" tone="ghost" onPress={() => router.push(`/t/${profile.teacher.slug}/bio`)} />
        {error ? <Notice>{error}</Notice> : null}
        <View style={{ gap: 12 }} testID="teacher-packs">
          <Title>Packs</Title>
          {profile.packs.length ? profile.packs.map((offer) => (
            <Card key={offer.id}>
              <Title>{offer.name}</Title>
              <Body muted>{offer.creditCount} credits · {money(offer.priceCents)}</Body>
              <Button label={busyId === offer.id ? "Starting…" : `Buy ${offer.name}`} disabled={busyId !== null} onPress={() => void buyPack(offer)} testID={`pack-${offer.slug}`} />
            </Card>
          )) : <Body muted>No packs yet.</Body>}
        </View>
        <View style={{ gap: 12 }} testID="teacher-memberships">
          <Title>Memberships</Title>
          {profile.memberships.length ? profile.memberships.map((offer) => (
            <Card key={offer.id}>
              <Title>{offer.name}</Title>
              <Body muted>{money(offer.priceCents)}</Body>
              <Button label={busyId === offer.id ? "Starting…" : `Join ${offer.name}`} disabled={busyId !== null} onPress={() => void buyMembership(offer)} testID={`membership-${offer.slug}`} />
            </Card>
          )) : <Body muted>No memberships yet.</Body>}
        </View>
        <View style={{ gap: 12 }}>
          <Title>Classes</Title>
          {profile.classes.map((item) => (
            <Button key={item.id} label={item.title} onPress={() => router.push(`/c/${item.slug}`)} />
          ))}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
