import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@mobile/api/fixtures";
import type { SocialProvider } from "@mobile/api/types";
import { friendlySocialError } from "@mobile/auth/messages";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { appleSignIn, googleSignIn } from "@mobile/device/social";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Login() {
  const router = useRouter();
  const { api, acceptSession } = useSession();
  const { colors, fonts } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(run: () => Promise<{ token: string; user: { id: string; name: string; email: string } }>) {
    setBusy(true);
    setError(null);
    try {
      const session = await run();
      await acceptSession(session);
      router.replace("/explore");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: SocialProvider) {
    await finish(async () => {
      try {
        const credential = provider === "apple" ? await appleSignIn() : await googleSignIn();
        return await api.signInSocial({
          provider,
          idToken: credential.idToken,
          nonce: credential.nonce,
          firstName: credential.firstName,
          lastName: credential.lastName,
        });
      } catch (err) {
        if (err instanceof ApiError) throw new Error(friendlySocialError(provider, err.status, err.message));
        throw err;
      }
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Welcome back</Display>
        <Body muted>Book classes and BeWell sessions with the same account as the website.</Body>
        {error ? <Notice>{error}</Notice> : null}
        <Button label="Continue with Apple" tone="ink" disabled={busy} onPress={() => void social("apple")} testID="sign-in-apple" />
        <Button label="Continue with Google" tone="ghost" disabled={busy} onPress={() => void social("google")} testID="sign-in-google" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" testID="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secure testID="password" />
        <Button label={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={() => void finish(() => api.signIn({ email, password }))} testID="sign-in" />
        <Button label="Continue with demo student" tone="ghost" testID="demo-student" onPress={() => void finish(() => api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD }))} />
        <Pressable accessibilityRole="link" accessibilityLabel="Forgot password" onPress={() => router.push("/forgot")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent }}>Forgot password</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Verify email" onPress={() => router.push("/verify")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent }}>Verify email</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Create an account" onPress={() => router.push("/signup")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.body, color: colors.ink }}>New here? Create an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
