import { useEffect, useState } from "react";
import type { Preferences } from "@mobile/api/types";
import { Body, Display, Screen, ToggleRow } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function PreferencesScreen() {
  const { api, ready, user } = useSession();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  useEffect(() => {
    if (!ready || !user) return;
    void api.preferences().then(setPrefs);
  }, [api, ready, user]);
  async function patch(next: { smsOptIn?: boolean; marketingOptIn?: boolean }) {
    await api.updatePreferences(next);
    setPrefs((current) => current ? { ...current, ...next } : current);
  }
  if (!prefs) return <Screen><Body>Loading preferences…</Body></Screen>;
  return (
    <Screen>
      <Display>Notifications</Display>
      <Body muted>Booking messages stay on unless you turn a channel off. Marketing is separate.</Body>
      <ToggleRow label="Texts about bookings" value={prefs.smsOptIn} onChange={(value) => void patch({ smsOptIn: value })} />
      <ToggleRow label="Offers from BeCreative" value={prefs.marketingOptIn} onChange={(value) => void patch({ marketingOptIn: value })} hint="Optional. Off by default." />
    </Screen>
  );
}
