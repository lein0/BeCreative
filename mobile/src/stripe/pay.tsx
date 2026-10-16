import { View } from "react-native";
import type { PaymentSheetParams } from "../api/types";
import { Button } from "../components/ui";

export function PayActions({
  onComplete,
  disabled,
}: {
  payment: PaymentSheetParams | null;
  onComplete: (paymentIntentId: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Button label="Pay with Apple Pay" disabled={disabled} onPress={() => onComplete("pi_mock_apple")} testID="pay-apple" />
      <Button label="Pay with Google Pay" tone="ink" disabled={disabled} onPress={() => onComplete("pi_mock_google")} testID="pay-google" />
      <Button label="Pay with card" tone="ghost" disabled={disabled} onPress={() => onComplete("pi_mock_card")} testID="pay-card" />
    </View>
  );
}
