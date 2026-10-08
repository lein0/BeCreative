import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ApiError } from "@mobile/api";
import type { PackOffer } from "@mobile/api/types";
import { openCheckoutSession } from "@mobile/checkout/browser";
import { startPackCheckout } from "@mobile/checkout/offer";
import { Body, Button, Display, Notice, Screen } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";

export default function PackLink() {
  const { slug, packSlug } = useLocalSearchParams<{ slug: string; packSlug: string }>();
  const router = useRouter();
  const { api, user } = useSession();
  const [offer, setOffer] = useState<PackOffer | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug || !packSlug) return;
    void api.teacher(slug).then((profile) => {
      const found = profile.packs.find((item) => item.slug === packSlug);
      if (!found) setMissing(true);
      else setOffer(found);
    }).catch(() => setMissing(true));
  }, [api, packSlug, slug]);

  async function buy() {
    if (!offer) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startPackCheckout(api, offer);
      if (result.checkoutUrl && !result.clientSecret) {
        await openCheckoutSession(result.checkoutUrl);
        router.replace("/bookings");
        return;
      }
      router.push("/checkout");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start that pack.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <Screen><Body>That pack is not listed.</Body><Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} /></Screen>;
  if (!offer) return <Screen><Body>Loading pack…</Body></Screen>;
  return (
    <Screen>
      <Display>{offer.name}</Display>
      <Body>{offer.creditCount} credits · {money(offer.priceCents)}</Body>
      <Body muted>Packs don't renew. Payment opens in the app when the studio can take a card, or you pay the teacher at the studio.</Body>
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Starting…" : "Buy pack"} disabled={busy} onPress={() => void buy()} />
      <Button label="See the teacher" tone="ghost" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
