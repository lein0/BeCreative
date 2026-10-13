import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import { Body, Button, Card, Display, Field, Notice, Title, ToggleRow } from "@mobile/components/ui";
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

  async function requestDeletion() {
    setError(null);
    try {
      const ticket = await api.createTicket({ category: "account", subject: "Delete my account", body: "Please delete my student account." });
      setNote(`Deletion request ${ticket.id} is open. You can also delete the account on the website under Privacy.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that.");
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
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboard="phone-pad" onBlur={() => void savePhone()} />
          <ToggleRow label="SMS opt-in" value={sms} onChange={(value) => void saveSms(value)} hint="Booking reminders only. You can turn this off any time." />
        </Card>
        <Card>
          <Title>Appearance</Title>
          <Button label={schemePreference === "system" ? "Theme: system" : schemePreference === "dark" ? "Theme: dark" : "Theme: light"} tone="ghost" onPress={() => setSchemePreference(schemePreference === "system" ? "dark" : schemePreference === "dark" ? "light" : "system")} />
        </Card>
        <Button label="Help" tone="ghost" onPress={() => router.push("/help")} />
        <Button label="Support tickets" tone="ghost" onPress={() => router.push("/tickets/new")} />
        <Button label="Sign out" tone="ink" onPress={() => void signOut().then(() => router.replace("/welcome"))} />
        <Card>
          <Title>Delete account</Title>
          <Body muted>The student API does not delete accounts directly. This opens a request, and the website Privacy page can delete it now.</Body>
          <Button label="Request deletion" onPress={() => void requestDeletion()} />
        </Card>
        <Body muted>API mode: {apiMode}. Teachers use the website.</Body>
      </View>
    </SafeAreaView>
  );
}
