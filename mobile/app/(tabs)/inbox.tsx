import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AppNotification } from "@mobile/api/types";
import { Body, Button, Card, Display, Title } from "@mobile/components/ui";
import { registerPush } from "@mobile/device/push";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Inbox() {
  const { api, track, ready, user } = useSession();
  const router = useRouter();
  const { colors, fonts } = useAppTheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !user) return;
    void api.notifications().then((result) => setItems(result.items));
    void track("screen_view", { screen: "inbox" });
  }, [api, ready, track, user]);

  async function enable() {
    const result = await registerPush(api);
    await track("push_permission", { status: result.status });
    setNote(result.status === "denied" ? "Notifications stay off until you allow them in system settings." : "This device is registered for booking reminders.");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: 20, gap: 14 }}>
        <Display>Inbox</Display>
        <Body muted>Booking updates and reminders. Marketing stays off unless you opt in.</Body>
        {note ? <Body>{note}</Body> : null}
        <Button label="Allow notifications" onPress={() => void enable()} testID="enable-push" />
        <Button label="Notification preferences" tone="ghost" onPress={() => router.push("/preferences")} />
        {items.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => { void api.markNotificationRead(item.id); if (item.href) router.push(item.href as "/bookings"); }}>
            <Card>
              <Title>{item.title}</Title>
              <Body>{item.body}</Body>
              <Body muted>{item.read ? "Read" : "New"}</Body>
            </Card>
          </Pressable>
        ))}
        <Body muted>{fonts.body ? "" : ""}</Body>
      </View>
    </SafeAreaView>
  );
}
