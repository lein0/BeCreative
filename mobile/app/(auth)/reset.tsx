import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Reset() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const { api } = useSession();
  const { colors } = useAppTheme();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!token) {
      setError("Open the reset link from your email. It includes the token this screen needs.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.confirmPasswordReset({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Choose a new password</Display>
        <Body muted>{token ? "This link is only for your account. Pick a password you don't use anywhere else." : "Open the link from the reset email to land here with a token."}</Body>
        {error ? <Notice>{error}</Notice> : null}
        {done ? <Body>Password updated. Sign in with the new one.</Body> : null}
        <Field label="New password" value={password} onChangeText={setPassword} secure testID="new-password" />
        <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secure testID="confirm-password" />
        <Button label={busy ? "Saving…" : "Update password"} disabled={busy || done} onPress={() => void save()} testID="save-password" />
        <Button label="Back to sign in" tone="ghost" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
