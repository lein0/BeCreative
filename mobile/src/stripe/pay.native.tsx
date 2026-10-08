import { useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { PaymentSheetParams } from "../api/types";
import { Button, Notice } from "../components/ui";

function intentId(secret: string) {
  const marker = "_secret";
  const index = secret.indexOf(marker);
  return index > 0 ? secret.slice(0, index) : secret;
}

export function PayActions({
  payment,
  onComplete,
  disabled,
}: {
  payment: PaymentSheetParams | null;
  onComplete: (paymentIntentId: string) => void;
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const [error, setError] = useState<string | null>(null);
  const liveKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  async function pay() {
    if (!liveKey || !payment) {
      onComplete("pi_mock_card");
      return;
    }
    const init = await stripe.initPaymentSheet({
      merchantDisplayName: payment.merchantDisplayName,
      customerId: payment.customerId,
      customerEphemeralKeySecret: payment.customerEphemeralKeySecret,
      paymentIntentClientSecret: payment.paymentIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: "becreative://checkout",
      applePay: { merchantCountryCode: payment.merchantCountryCode },
      googlePay: { merchantCountryCode: payment.merchantCountryCode, testEnv: payment.googlePayTestEnv, currencyCode: "USD" },
    });
    if (init.error) {
      setError(init.error.message);
      return;
    }
    const presented = await stripe.presentPaymentSheet();
    if (presented.error) {
      if (presented.error.code === "Canceled") return;
      setError(presented.error.message);
      return;
    }
    onComplete(intentId(payment.paymentIntentClientSecret));
  }
  return (
    <View style={{ gap: 10 }}>
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Pay with Apple Pay or Google Pay" disabled={disabled} onPress={() => void pay()} testID="pay-sheet" />
    </View>
  );
}
