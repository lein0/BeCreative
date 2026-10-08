import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@mobile/api/fixtures";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { appleSignIn, googleSignInToken } from "@mobile/device/social";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Login() {
  const router = useRouter();
  const { api, acceptSession, track, apiMode } = useSession();
  const { colors, fonts } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(run: () => Promise<{ token: string; expiresAt: string; user: Parameters<typeof acceptSession>[0]["user"] }>) {
    setBusy(true);
    setError(null);
    try {
      const session = await run();
      await acceptSession(session);
      await track("login", { method: "password" });
      router.replace("/explore");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }}>
        <Display>Welcome back</Display>
        <Body muted>Book classes and BeWell sessions with the same account as the website.</Body>
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" testID="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secure testID="password" />
        <Button label={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={() => void finish(() => api.login({ email, password }))} testID="sign-in" />
        <Button label="Continue with Google" tone="ink" disabled={busy} onPress={() => void finish(async () => api.loginWithGoogle({ idToken: apiMode === "mock" ? "mock-google" : await googleSignInToken() }))} />
        <Button label="Sign in with Apple" tone="ghost" disabled={busy} onPress={() => void finish(async () => {
          if (apiMode === "mock") return api.loginWithApple({ idToken: "mock-apple", nonce: "mock" });
          const apple = await appleSignIn();
          return api.loginWithApple(apple);
        })} />
        {apiMode === "mock" ? (
          <Button label="Continue with demo student" tone="ghost" testID="demo-student" onPress={() => void finish(() => api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }))} />
        ) : null}
        <Pressable accessibilityRole="link" accessibilityLabel="Forgot password" onPress={() => router.push("/forgot")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.accent }}>Forgot password</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Create an account" onPress={() => router.push("/signup")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.body, color: colors.ink }}>New here? Create an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
