import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Forgot() {
  const router = useRouter();
  const { api } = useSession();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Reset password</Display>
        <Body muted>We'll email a link that opens this app. It lands on Reset, where you choose a new password.</Body>
        {error ? <Notice>{error}</Notice> : null}
        {sent ? <Body>If that email is on an account, the reset link is on its way.</Body> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" testID="reset-email" />
        <Button label={busy ? "Sending…" : "Send reset link"} disabled={busy} onPress={() => void send()} testID="send-reset" />
        <Button label="Back to sign in" tone="ghost" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
