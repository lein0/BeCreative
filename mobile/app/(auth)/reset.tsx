import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display } from "@mobile/components/ui";
import { useAppTheme } from "@mobile/theme/theme";

export default function Reset() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Choose a new password</Display>
        <Body muted>Set the new password on the website, then sign in here with it.</Body>
        <Button label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
