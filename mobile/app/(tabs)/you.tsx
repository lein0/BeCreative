import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { DeleteAccountInput, SocialProvider } from "@mobile/api/types";
import { friendlySocialError } from "@mobile/auth/messages";
import { Body, Button, Card, ConfirmDialog, Display, Field, Notice, Title, ToggleRow } from "@mobile/components/ui";
import { appleSignIn, googleSignIn } from "@mobile/device/social";
import { phoneDraftToSave } from "@mobile/profile/phone";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function You() {
  const { user, api, signOut, schemePreference, setSchemePreference, apiMode, ready } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [sms, setSms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<DeleteAccountInput | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    void api.preferences().then((prefs) => {
      setPhone(prefs.phone ?? "");
      setSavedPhone(prefs.phone ?? "");
      setSms(prefs.smsOptIn);
    }).catch(() => undefined);
  }, [api, ready, user]);

  async function saveSms(next: boolean) {
    setError(null);
    try {
      await api.updatePreferences({ phone, smsOptIn: next });
      setSms(next);
      setSavedPhone(phone.trim());
      setNote(next ? "Texts are on for booking updates." : "Texts are off.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update texts.");
    }
  }

  async function savePhone() {
    const update = phoneDraftToSave(savedPhone, phone, sms);
    if (!update) return;
    setError(null);
    try {
      await api.updatePreferences(update);
      setPhone(update.phone);
      setSavedPhone(update.phone);
      setNote("Mobile number saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the mobile number.");
    }
  }

  async function sendVerification() {
    if (!user) return;
    setError(null);
    try {
      await api.requestEmailVerification(user.email);
      setNote("If that email still needs verification, the link is on its way.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the verification email.");
    }
  }

  function reviewPassword() {
    if (!password) {
      setError("Enter your password to confirm it's you.");
      return;
    }
    setError(null);
    setPending({ password });
  }

  async function reviewSocial(provider: SocialProvider) {
    setBusy(true);
    setError(null);
    try {
      const credential = provider === "apple" ? await appleSignIn() : await googleSignIn();
      setPending({ provider, idToken: credential.idToken, nonce: credential.nonce });
    } catch (err) {
      if (err instanceof ApiError) setError(friendlySocialError(provider, err.status, err.message));
      else setError(err instanceof Error ? err.message : "Could not confirm that sign-in.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(pending);
      setPending(null);
      await signOut();
      router.replace("/welcome");
    } catch (err) {
      setPending(null);
      if (err instanceof ApiError) {
        const provider = pending.provider;
        setError(provider ? friendlySocialError(provider, err.status, err.message) : err.message);
      } else {
        setError("Could not delete the account.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} testID="you-screen">
        <Display>You</Display>
        <Body>{user?.name}</Body>
        <Body muted>{user?.email}</Body>
        {error ? <Notice>{error}</Notice> : null}
        {note ? <Body>{note}</Body> : null}
        <Card>
          <Title>Texts</Title>
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboard="phone-pad" onBlur={() => void savePhone()} />
          <ToggleRow label="SMS opt-in" value={sms} onChange={(value) => void saveSms(value)} hint="Booking reminders only. You can turn this off any time." />
        </Card>
        <Card>
          <Title>Appearance</Title>
          <Button label={schemePreference === "system" ? "Theme: system" : schemePreference === "dark" ? "Theme: dark" : "Theme: light"} tone="ghost" onPress={() => setSchemePreference(schemePreference === "system" ? "dark" : schemePreference === "dark" ? "light" : "system")} />
        </Card>
        <Button label="Send verification email" tone="ghost" onPress={() => void sendVerification()} />
        <Button label="Help" tone="ghost" onPress={() => router.push("/help")} />
        <Button label="Support tickets" tone="ghost" onPress={() => router.push("/tickets/new")} />
        <Button label="Sign out" tone="ink" onPress={() => void signOut().then(() => router.replace("/welcome"))} />
        <Card>
          <Title>Delete account</Title>
          <Body muted>This removes your profile and signs you out. Bookings and orders stay so the studio ledger is intact.</Body>
          {!confirming ? <Button label="Delete account" onPress={() => setConfirming(true)} testID="delete-account" /> : (
            <View style={{ gap: 12 }} testID="delete-confirm">
              <Body>Confirm it's you. Enter the password for this account, or sign in with Apple or Google again.</Body>
              <Field label="Password" value={password} onChangeText={setPassword} secure testID="delete-password" />
              <Button label="Continue with password" disabled={busy} onPress={reviewPassword} testID="delete-with-password" />
              <Button label="Confirm with Apple" tone="ink" disabled={busy} onPress={() => void reviewSocial("apple")} />
              <Button label="Confirm with Google" tone="ghost" disabled={busy} onPress={() => void reviewSocial("google")} />
              <Button label="Keep my account" tone="ghost" onPress={() => { setConfirming(false); setPassword(""); setPending(null); }} />
            </View>
          )}
        </Card>
        <Body muted>API mode: {apiMode}. Teachers use the website.</Body>
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(pending)}
        title="Delete account"
        body="Your name and email are removed, and this device is signed out. This can't be undone in the app."
        confirmLabel={busy ? "Deleting…" : "Delete my account"}
        onConfirm={() => void removeAccount()}
        onClose={() => setPending(null)}
      />
    </SafeAreaView>
  );
}
