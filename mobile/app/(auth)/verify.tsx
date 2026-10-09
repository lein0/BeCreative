import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { shouldConfirmVerification } from "@mobile/auth/verify-token";
import { Body, Button, Display, Field, Notice } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function VerifyEmail() {
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const { api, user } = useSession();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmedToken = useRef<string | null>(null);

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email);
  }, [user]);

  useEffect(() => {
    if (!shouldConfirmVerification(confirmedToken.current, token)) return;
    confirmedToken.current = token;
    const attempt = token;
    setError(null);
    setNote(null);
    setBusy(true);
    void api.confirmEmailVerification(token).then(() => {
      if (confirmedToken.current !== attempt) return;
      setNote("Email verified. You can keep booking.");
    }).catch((err: unknown) => {
      if (confirmedToken.current !== attempt) return;
      setError(err instanceof ApiError ? err.message : "That verification link is not valid.");
    }).finally(() => {
      if (confirmedToken.current !== attempt) return;
      setBusy(false);
    });
  }, [api, token]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.requestEmailVerification(email.trim());
      setNote("If that email is on an account, the verification link is on its way. It opens this screen.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the verification email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 24, gap: 16 }} testID="verify-screen">
        <Display>Verify email</Display>
        <Body muted>{token ? "We're checking the link from your email." : "Ask for a new link. It opens this app at Verify."}</Body>
        {error ? <Notice>{error}</Notice> : null}
        {note ? <Body>{note}</Body> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" testID="verify-email" />
        <Button label={busy ? "Working…" : "Send verification link"} disabled={busy} onPress={() => void send()} testID="send-verify" />
        <Button label={user ? "Continue" : "Back to sign in"} tone="ghost" onPress={() => router.replace(user ? "/explore" : "/login")} />
      </View>
    </SafeAreaView>
  );
}
