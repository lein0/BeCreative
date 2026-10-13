import { View } from "react-native";
import { Button } from "../components/ui";

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
  const ready = Boolean(clientSecret);
  return (
    <View style={{ gap: 10 }}>
      <Button label="Pay" disabled={disabled || !ready} onPress={() => onComplete(clientSecret || "pi_mock")} testID="pay-sheet" />
    </View>
  );
}
