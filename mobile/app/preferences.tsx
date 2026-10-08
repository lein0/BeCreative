import { useEffect, useState } from "react";
import type { NotificationPreferences } from "@mobile/api/types";
import { Body, Display, Screen, ToggleRow } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function Preferences() {
  const { api } = useSession();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  useEffect(() => {
    void api.notificationPreferences().then(setPrefs);
  }, [api]);
  async function patch(next: Partial<NotificationPreferences>) {
    const updated = await api.updateNotificationPreferences(next);
    setPrefs(updated);
  }
  if (!prefs) return <Screen><Body>Loading preferences…</Body></Screen>;
  return (
    <Screen>
      <Display>Notifications</Display>
      <Body muted>Booking messages stay on unless you turn them off. Marketing is separate.</Body>
      <ToggleRow label="Booking updates" value={prefs.pushBookings} onChange={(value) => void patch({ pushBookings: value })} />
      <ToggleRow label="Reminders" value={prefs.pushReminders} onChange={(value) => void patch({ pushReminders: value })} />
      <ToggleRow label="Offers from BeCreative" value={prefs.pushMarketing} onChange={(value) => void patch({ pushMarketing: value })} hint="Optional. Off by default." />
    </Screen>
  );
}
