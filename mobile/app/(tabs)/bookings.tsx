import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { BookingListItem, Slot } from "@mobile/api/types";
import { Body, Button, Card, ConfirmDialog, Display, Notice, Sheet, Title } from "@mobile/components/ui";
import { whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Bookings() {
  const { api, track, ready, user } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [rows, setRows] = useState<BookingListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [options, setOptions] = useState<Slot[]>([]);

  const load = useCallback(() => {
    void api.bookings().then((result) => setRows(result.bookings)).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load bookings."));
  }, [api]);

  useEffect(() => {
    if (!ready || !user) return;
    load();
    void track("screen_view", { screen: "bookings" });
  }, [load, ready, track, user]);

  async function confirmCancel() {
    if (!cancelId) return;
    try {
      const result = await api.cancelBooking(cancelId);
      setMessage(result.outcome === "full_refund" ? "Cancelled. A refund is on the way." : result.outcome === "credit" ? "Cancelled. Studio credit was added." : "Cancelled.");
      await track("booking_cancelled", { bookingId: cancelId });
      setCancelId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
      setCancelId(null);
    }
  }

  async function openMove(row: BookingListItem) {
    if (row.status !== "confirmed") {
      setError("Only a confirmed booking can move.");
      return;
    }
    const detail = await api.classDetail(row.slug);
    setOptions(detail.slots);
    setMoveId(row.id);
  }

  async function moveTo(sessionId: string) {
    if (!moveId) return;
    try {
      await api.rescheduleBooking(moveId, sessionId);
      setMessage("You're moved. The old time is released.");
      setMoveId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reschedule.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} testID="bookings-screen">
        <Display testID="bookings-title">My bookings</Display>
        {message ? <Body>{message}</Body> : null}
        {error ? <Notice>{error}</Notice> : null}
        {rows.map((row) => (
          <Card key={row.id}>
            <Title>{row.title}</Title>
            <Body muted>{row.status}</Body>
            <Button label="Get help with this booking" tone="ghost" onPress={() => router.push(`/help/${row.id}`)} />
            {row.status !== "cancelled" ? <Button label="Cancel" tone="ghost" onPress={() => setCancelId(row.id)} testID={`cancel-${row.id}`} /> : null}
            {row.status === "confirmed" ? <Button label="Reschedule" tone="ink" onPress={() => void openMove(row)} /> : null}
          </Card>
        ))}
        {!rows.length ? <Body muted>No bookings yet. Explore is a good place to start.</Body> : null}
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(cancelId)}
        title="Cancel booking"
        body="The studio's cancellation policy decides the refund."
        confirmLabel="Cancel booking"
        onConfirm={() => void confirmCancel()}
        onClose={() => setCancelId(null)}
      />
      <Sheet visible={Boolean(moveId)} title="Move this booking" onClose={() => setMoveId(null)}>
        {options.map((slot) => (
          <Button key={slot.id} label={whenLabel(slot.startsAt)} tone="ghost" onPress={() => void moveTo(slot.id)} />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}
