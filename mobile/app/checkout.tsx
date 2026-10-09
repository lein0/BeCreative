import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Card, Display, Notice } from "@mobile/components/ui";
import { openCheckoutSession } from "@mobile/checkout/browser";
import { readCheckoutDraft } from "@mobile/checkout/draft";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";
import { PayActions } from "@mobile/stripe/pay";
import { useAppTheme } from "@mobile/theme/theme";

export default function Checkout() {
  const draft = readCheckoutDraft();
  const { track } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [opening, setOpening] = useState(false);

  async function finishSheet(paymentIntentId: string) {
    setDone(true);
    await track("checkout_completed", { orderId: draft?.orderId ?? "", paymentIntentId });
  }

  async function finishBrowser() {
    if (!draft?.checkoutUrl) return;
    setOpening(true);
    setError(null);
    try {
      const result = await openCheckoutSession(draft.checkoutUrl);
      if (result === "cancel") {
        setError("Checkout was cancelled. You can try again.");
        return;
      }
      if (result !== "success") {
        setError("Checkout closed before it finished. You can try again.");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open checkout.");
    } finally {
      setOpening(false);
    }
  }

  const total = draft?.studentPaysCents ?? 0;
  const discount = draft?.discountCents ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID="checkout-screen">
      <View style={{ padding: 20, gap: 14 }}>
        <Display>Checkout</Display>
        {error ? <Notice>{error}</Notice> : null}
        {!draft ? <Body>Start from a class to see the price.</Body> : null}
        {draft ? (
          <Card>
            <Body>{draft.title}</Body>
            {draft.codeApplied ? <Body muted>Code {draft.codeApplied}</Body> : null}
            <Body>Price {money(draft.listPriceCents)}</Body>
            {discount > 0 ? <Body>Promo discount −{money(discount)}</Body> : null}
            <Display testID="checkout-total">{money(total)}</Display>
          </Card>
        ) : null}
        {draft?.waitlisted ? <Body>You're on the waitlist. Nothing is charged yet.</Body> : null}
        {draft?.alreadyBooked ? (
          <View style={{ gap: 12 }}>
            <Body>You already have this booking.</Body>
            <Button label="See my bookings" onPress={() => router.replace("/bookings")} testID="see-bookings" />
          </View>
        ) : done ? (
          <View style={{ gap: 12 }}>
            <Body>You're booked. A receipt is on its way.</Body>
            <Button label="See my bookings" onPress={() => router.replace("/bookings")} testID="see-bookings" />
          </View>
        ) : draft?.checkoutUrl ? (
          <Button label={opening ? "Opening checkout…" : "Continue"} disabled={opening} onPress={() => void finishBrowser()} testID="open-checkout" />
        ) : draft?.clientSecret ? (
          Platform.OS === "web" && !draft.clientSecret.startsWith("pi_mock") ? (
            <View style={{ gap: 12 }}>
              <Body>Your total is ready. The payment sheet opens in the iOS and Android app.</Body>
              <Button label="Pay" disabled onPress={() => undefined} testID="pay-sheet" />
            </View>
          ) : (
            <PayActions clientSecret={draft.clientSecret} publishableKey={draft.publishableKey} onComplete={(id) => void finishSheet(id)} />
          )
        ) : draft && !draft.waitlisted ? (
          <View style={{ gap: 12 }}>
            <Body>{total === 0 ? "Nothing to pay today." : "You're booked. Pay the teacher when you arrive."}</Body>
            <Button label="See my bookings" onPress={() => router.replace("/bookings")} testID="see-bookings" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
