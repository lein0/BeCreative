import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Signup() {
  const router = useRouter();
  const { api } = useSession();
  const { colors } = useAppTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await api.signup({ name, email, password });
      router.push({ pathname: "/verify-email", params: { email } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Create your account</Display>
        <Body muted>Students only. If you teach, use the website.</Body>
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Name" value={name} onChangeText={setName} testID="signup-name" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secure />
        <Button label="Create account" onPress={() => void submit()} />
        <Button label="I already have an account" tone="ghost" onPress={() => router.push("/login")} />
      </View>
    </SafeAreaView>
  );
}
