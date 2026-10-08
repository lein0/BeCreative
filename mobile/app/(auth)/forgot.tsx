import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Forgot() {
  const { api, apiMode } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Reset password</Display>
        <Body muted>We'll email a link that opens this app.</Body>
        {error ? <Notice>{error}</Notice> : null}
        {sent ? <Body>If that email has an account, the reset link is on its way.{apiMode === "mock" ? " Preview token: reset-demo." : ""}</Body> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" />
        <Button label="Send reset link" onPress={() => void submit()} />
        <Button label="I have a reset token" tone="ghost" onPress={() => router.push("/reset")} />
      </View>
    </SafeAreaView>
  );
}
