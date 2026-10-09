import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ApiError } from "@mobile/api";
import { Body, Button, ConfirmDialog, Display, Notice, Screen } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function BookingHelp() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function cancel() {
    if (!bookingId) return;
    setError(null);
    try {
      await api.cancelBooking(bookingId);
      setNote("Cancelled. The studio's policy decides the refund.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
    }
  }

  return (
    <Screen>
      <Display>Help with this booking</Display>
      {error ? <Notice>{error}</Notice> : null}
      {note ? <Body>{note}</Body> : null}
      <Button label="Cancel this booking" tone="ghost" onPress={() => setConfirming(true)} />
      <ConfirmDialog
        visible={confirming}
        title="Cancel booking"
        body="Inside two hours the seat is released with no refund. Cancel this booking?"
        confirmLabel="Cancel booking"
        onConfirm={() => {
          setConfirming(false);
          void cancel();
        }}
        onClose={() => setConfirming(false)}
      />
      <Button label="Reschedule" tone="ghost" onPress={() => router.push("/bookings")} />
      <Button label="Ask a person" onPress={() => router.push({ pathname: "/tickets/new", params: { bookingId: bookingId ?? "" } })} />
      <Button label="Back" tone="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
