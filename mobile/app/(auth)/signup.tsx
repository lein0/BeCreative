import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { authNeedsVerification, postLoginPath } from "../../../lib/mobile-client";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Signup() {
  const router = useRouter();
  const destination = postLoginPath(useLocalSearchParams<{ next?: string }>().next);
  const { api, acceptSession, track } = useSession();
  const { colors } = useAppTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await track("signup_started", {});
      const session = await api.signUp({ name, email, password });
      if (authNeedsVerification(session)) {
        router.replace({ pathname: "/verify-email", params: { email } });
        return;
      }
      await acceptSession(session);
      router.replace(destination as "/explore");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Create your account</Display>
        <Body muted>Students only. If you teach, use the website. You're signed in as soon as the account is created.</Body>
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Name" value={name} onChangeText={setName} testID="signup-name" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secure />
        <Button label="Create account" onPress={() => void submit()} />
        <Button label="I already have an account" tone="ghost" onPress={() => router.push(destination === "/explore" ? "/login" : { pathname: "/login", params: { next: destination } })} />
      </View>
    </SafeAreaView>
  );
}
