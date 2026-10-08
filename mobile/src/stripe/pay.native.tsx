import { useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, Notice } from "../components/ui";

function intentId(secret: string) {
  const marker = "_secret";
  const index = secret.indexOf(marker);
  return index > 0 ? secret.slice(0, index) : secret;
}

export function PayActions({
  clientSecret,
  onComplete,
  disabled,
}: {
  clientSecret: string | null;
  publishableKey?: string | null;
  onComplete: (paymentIntentId: string) => void;
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const [error, setError] = useState<string | null>(null);
  const liveKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  async function pay() {
    if (!clientSecret) return;
    if (!liveKey) {
      onComplete(intentId(clientSecret));
      return;
    }
    const init = await stripe.initPaymentSheet({
      merchantDisplayName: "BeCreative",
      paymentIntentClientSecret: clientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: "becreative://bookings",
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
    onComplete(intentId(clientSecret));
  }
  return (
    <View style={{ gap: 10 }}>
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Pay" disabled={disabled || !clientSecret} onPress={() => void pay()} testID="pay-sheet" />
    </View>
  );
}
