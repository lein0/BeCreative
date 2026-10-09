import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { HelpAction } from "@mobile/api/types";
import { ApiError } from "@mobile/api";
import { Body, Button, Card, Display, Notice, Screen } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function BookingHelp() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [actions, setActions] = useState<HelpAction[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!bookingId) return;
    void api.helpActions(bookingId).then((result) => setActions(result.actions));
  }, [api, bookingId]);

  async function run(action: HelpAction) {
    if (!action.enabled || !bookingId) return;
    setError(null);
    try {
      if (action.id === "cancel") {
        const result = await api.cancelBooking(bookingId);
        setNote(result.message);
        return;
      }
      if (action.id === "reschedule") {
        router.push("/bookings");
        return;
      }
      if (action.id === "waiver_copy") {
        const ticket = await api.createTicket({ bookingId, subject: "Waiver copy", body: "Please email me the waiver I signed." });
        setNote(`Ticket ${ticket.id} is open. We'll email the waiver.`);
        return;
      }
      router.push({ pathname: "/tickets/new", params: { bookingId, subject: action.id === "safety" ? "Safety issue" : "Question for my teacher" } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That action did not complete.");
    }
  }

  return (
    <Screen>
      <Display>Get help with this booking</Display>
      {note ? <Body>{note}</Body> : null}
      {error ? <Notice>{error}</Notice> : null}
      {actions.map((action) => (
        <Card key={action.id}>
          <Body>{action.label}</Body>
          <Body muted>{action.detail}</Body>
          <Button label={action.label} tone={action.enabled ? "accent" : "ghost"} disabled={!action.enabled} onPress={() => void run(action)} />
        </Card>
      ))}
    </Screen>
  );
}
