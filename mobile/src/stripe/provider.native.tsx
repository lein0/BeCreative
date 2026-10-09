import { StripeProvider } from "@stripe/stripe-react-native";
import { Children, type ReactElement, type ReactNode } from "react";

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_mock";
const merchantIdentifier = process.env.APPLE_MERCHANT_ID || "merchant.com.becreative.students";

export function PaymentsProvider({ children }: { children: ReactNode }) {
  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier={merchantIdentifier} urlScheme="becreative">
      {Children.toArray(children) as ReactElement[]}
    </StripeProvider>
  );
}
