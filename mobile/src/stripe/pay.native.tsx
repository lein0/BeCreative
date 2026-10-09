import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, Notice } from "../components/ui";
import { PAYMENT_SHEET_RETURN_URL } from "../../../lib/mobile-client";
import { paymentSheetPlan, type PaymentSheetPlan } from "./sheet-plan";

const merchantIdentifier = process.env.APPLE_MERCHANT_ID || "merchant.com.becreative.students";

function intentId(secret: string) {
  const marker = "_secret";
  const index = secret.indexOf(marker);
  return index > 0 ? secret.slice(0, index) : secret;
}

function PayButton({
  clientSecret,
  onComplete,
  disabled,
  plan,
}: {
  clientSecret: string | null;
  onComplete: (paymentIntentId: string) => void;
  disabled?: boolean;
  plan: PaymentSheetPlan;
}) {
  const stripe = useStripe();
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    if (!clientSecret) return;
    if (plan.kind === "unavailable") {
      setError("Card payment needs a Stripe publishable key before it can charge this booking.");
      return;
    }
    if (plan.kind === "mock") {
      onComplete(intentId(clientSecret));
      return;
    }
    const init = await stripe.initPaymentSheet({
      merchantDisplayName: "BeCreative",
      paymentIntentClientSecret: clientSecret,
      allowsDelayedPaymentMethods: false,
      returnURL: PAYMENT_SHEET_RETURN_URL,
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

export function PayActions({
  clientSecret,
  publishableKey,
  onComplete,
  disabled,
}: {
  clientSecret: string | null;
  publishableKey?: string | null;
  onComplete: (paymentIntentId: string) => void;
  disabled?: boolean;
}) {
  const plan = clientSecret
    ? paymentSheetPlan({ clientSecret, envKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, apiKey: publishableKey })
    : { kind: "unavailable" as const };
  const key = plan.kind === "sheet" ? plan.publishableKey : process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_mock";
  return (
    <StripeProvider publishableKey={key} merchantIdentifier={merchantIdentifier} urlScheme="becreative">
      <PayButton clientSecret={clientSecret} onComplete={onComplete} disabled={disabled} plan={plan} />
    </StripeProvider>
  );
}
