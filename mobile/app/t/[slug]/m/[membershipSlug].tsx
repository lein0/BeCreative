import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ApiError } from "@mobile/api";
import type { MembershipOffer } from "@mobile/api/types";
import { openCheckoutSession } from "@mobile/checkout/browser";
import { startMembershipCheckout } from "@mobile/checkout/offer";
import { Body, Button, Display, Notice, Screen } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";

export default function MembershipLink() {
  const { slug, membershipSlug } = useLocalSearchParams<{ slug: string; membershipSlug: string }>();
  const router = useRouter();
  const { api, user } = useSession();
  const [offer, setOffer] = useState<MembershipOffer | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug || !membershipSlug) return;
    void api.teacher(slug).then((profile) => {
      const found = profile.memberships.find((item) => item.slug === membershipSlug);
      if (!found) setMissing(true);
      else setOffer(found);
    }).catch(() => setMissing(true));
  }, [api, membershipSlug, slug]);

  async function buy() {
    if (!offer) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startMembershipCheckout(api, offer);
      if (result.checkoutUrl) {
        await openCheckoutSession(result.checkoutUrl);
        router.replace("/bookings");
        return;
      }
      router.push("/checkout");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start that membership.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <Screen><Body>That membership is not listed.</Body><Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} /></Screen>;
  if (!offer) return <Screen><Body>Loading membership…</Body></Screen>;
  return (
    <Screen>
      <Display>{offer.name}</Display>
      <Body>{money(offer.priceCents)}</Body>
      <Body muted>Memberships renew, so checkout opens in the browser and returns to your bookings.</Body>
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Starting…" : "Join"} disabled={busy} onPress={() => void buy()} />
      <Button label="See the teacher" tone="ghost" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
