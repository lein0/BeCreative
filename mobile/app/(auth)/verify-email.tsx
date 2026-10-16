import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function VerifyEmail() {
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const router = useRouter();
  const { api, acceptSession } = useSession();
  const { colors } = useAppTheme();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const email = typeof params.email === "string" ? params.email : "";

  async function submit() {
    setError(null);
    try {
      const session = await api.verifyEmail({ email, code, token: typeof params.token === "string" ? params.token : undefined });
      await acceptSession(session);
      router.replace("/explore");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Check your email</Display>
        <Body muted>Enter the 6-digit code. In the preview, the code is 123456.</Body>
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Code" value={code} onChangeText={setCode} testID="verify-code" />
        <Button label="Verify" onPress={() => void submit()} />
        <Button label="Resend" tone="ghost" onPress={() => void api.resendVerification(email)} />
      </View>
    </SafeAreaView>
  );
}
