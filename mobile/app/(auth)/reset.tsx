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
  const router = useRouter();
  const { api } = useSession();
  const { colors } = useAppTheme();
  const [token, setToken] = useState(typeof params.token === "string" ? params.token : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Choose a new password</Display>
        <Body muted>Use at least 8 characters.</Body>
        {error ? <Notice>{error}</Notice> : null}
        {done ? <Body>Password updated. Sign in with the new one.</Body> : null}
        <Field label="Reset token" value={token} onChangeText={setToken} />
        <Field label="New password" value={password} onChangeText={setPassword} secure />
        <Button label="Update password" onPress={() => void submit()} />
        <Button label="Back to sign in" tone="ghost" onPress={() => router.replace("/login")} />
      </View>
    </SafeAreaView>
  );
}
