import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display } from "@mobile/components/ui";
import { useAppTheme } from "@mobile/theme/theme";

export default function Forgot() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Reset password</Display>
        <Body muted>Password reset is on the website. Open classes.becreative.app/forgot, then come back and sign in here.</Body>
        <Button label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
