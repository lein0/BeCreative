import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display } from "@mobile/components/ui";
import { useAppTheme } from "@mobile/theme/theme";

export default function VerifyEmail() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>You're in</Display>
        <Body muted>The student API signs you in when the account is created. Email verification stays on the website.</Body>
        <Button label="Continue" onPress={() => router.replace("/explore")} />
      </View>
    </SafeAreaView>
  );
}
