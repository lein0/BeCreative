import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Card, Display, Field, Notice, Title, ToggleRow } from "@mobile/components/ui";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function You() {
  const { user, api, refreshUser, signOut, schemePreference, setSchemePreference, apiMode } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [sms, setSms] = useState(Boolean(user?.smsOptIn));
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function saveSms(next: boolean) {
    setError(null);
    try {
      const updated = await api.updateMe({ phone, smsOptIn: next });
      setSms(updated.smsOptIn);
      refreshUser(updated);
      setNote(next ? "Texts are on for booking updates." : "Texts are off.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update texts.");
    }
  }

  async function removeAccount() {
    setError(null);
    try {
      await api.deleteMe(confirm);
      await signOut();
      router.replace("/welcome");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the account.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: 20, gap: 14 }}>
        <Display>You</Display>
        <Body>{user?.name}</Body>
        <Body muted>{user?.email}</Body>
        {error ? <Notice>{error}</Notice> : null}
        {note ? <Body>{note}</Body> : null}
        <Card>
          <Title>Texts</Title>
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboard="phone-pad" />
          <ToggleRow label="SMS opt-in" value={sms} onChange={(value) => void saveSms(value)} hint="Booking reminders only. You can turn this off any time." />
        </Card>
        <Card>
          <Title>Appearance</Title>
          <Button label={schemePreference === "system" ? "Theme: system" : schemePreference === "dark" ? "Theme: dark" : "Theme: light"} tone="ghost" onPress={() => setSchemePreference(schemePreference === "system" ? "dark" : schemePreference === "dark" ? "light" : "system")} />
        </Card>
        <Button label="Help and FAQ" tone="ghost" onPress={() => router.push("/help")} />
        <Button label="Support tickets" tone="ghost" onPress={() => router.push("/tickets/new")} />
        <Button label="Sign out" tone="ink" onPress={() => void signOut().then(() => router.replace("/welcome"))} />
        <Card>
          <Title>Delete account</Title>
          <Body muted>This removes your student account and signs you out. Required by the App Store. Type DELETE to confirm.</Body>
          <Field label="Type DELETE" value={confirm} onChangeText={setConfirm} testID="delete-confirm" />
          <Button label="Delete my account" onPress={() => void removeAccount()} />
        </Card>
        <Body muted>API mode: {apiMode}. Teachers use the website.</Body>
      </View>
    </SafeAreaView>
  );
}
