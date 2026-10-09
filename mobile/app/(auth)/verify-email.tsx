import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display } from "@mobile/components/ui";
import { useAppTheme } from "@mobile/theme/theme";

export default function VerifyEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { colors } = useAppTheme();
  const address = typeof email === "string" ? email : "";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Check your email</Display>
        <Body muted>{address ? `We sent a verification link to ${address}.` : "We sent a verification link."} Sign in after you confirm it. The app does not start a session until then.</Body>
        <Button label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
