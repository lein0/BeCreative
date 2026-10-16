import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { OrderRecord } from "@mobile/api/types";
import { Body, Button, Card, Display, Notice } from "@mobile/components/ui";
import { money } from "@mobile/format";
import { useSession } from "@mobile/session";
import { PayActions } from "@mobile/stripe/pay";
import { useAppTheme } from "@mobile/theme/theme";

export default function Checkout() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { api, track } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    void api.getOrder(orderId).then(setOrder).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load checkout."));
  }, [api, orderId]);

  async function complete(paymentIntentId: string) {
    if (!order) return;
    setError(null);
    try {
      const paid = order.payment ? await api.confirmPayment(order.id, paymentIntentId) : order;
      setOrder(paid);
      setDone(true);
      await track("checkout_completed", { orderId: order.id, platformPay: paymentIntentId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment did not complete.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID="checkout-screen">
      <View style={{ padding: 20, gap: 14 }}>
        <Display>Checkout</Display>
        {error ? <Notice>{error}</Notice> : null}
        {!order ? <Body>Loading payment…</Body> : null}
        {order ? (
          <Card>
            <Body>{order.classTitle}</Body>
            <Body muted>{order.kind}{order.promoCode ? ` · code ${order.promoCode}` : ""}</Body>
            <Body>List {money(order.listPriceCents)}</Body>
            {order.discountCents ? <Body>Discount {money(order.discountCents)}</Body> : null}
            <Display>{money(order.studentPaysCents)}</Display>
            <Body muted>Paid to the teacher through BeCreative. Real-world classes use Stripe, not Apple in-app purchase.</Body>
          </Card>
        ) : null}
        {done ? (
          <View style={{ gap: 12 }}>
            <Body>You're booked. A receipt is on its way.</Body>
            <Button label="See my bookings" onPress={() => router.replace("/bookings")} testID="see-bookings" />
          </View>
        ) : order && order.studentPaysCents === 0 ? (
          <Button label="Confirm free booking" onPress={() => void complete("free")} />
        ) : order ? (
          <PayActions payment={order.payment} onComplete={(id) => void complete(id)} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
