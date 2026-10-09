import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { BookingRecord, ClassDetail } from "@mobile/api/types";
import { calendarEvent, canReschedule, cancelDecision } from "@mobile/booking/flow";
import { Body, Button, Card, ConfirmDialog, Display, Notice, Sheet, Title } from "@mobile/components/ui";
import { addToCalendar } from "@mobile/device/calendar";
import { money, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Bookings() {
  const { api, track, ready, user } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [rows, setRows] = useState<BookingRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [options, setOptions] = useState<ClassDetail | null>(null);
  const cancelTarget = rows.find((item) => item.id === cancelId) ?? null;
  const cancelCopy = cancelTarget ? cancelDecision({ now: new Date(), startsAt: new Date(cancelTarget.startsAt), status: cancelTarget.status, kind: cancelTarget.kind }) : null;

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
      setMessage(result.message);
      await track("booking_cancelled", { bookingId: cancelId, refund: result.refund });
      setCancelId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
      setCancelId(null);
    }
  }

  async function openMove(row: BookingRecord) {
    const allowed = canReschedule({ now: new Date(), startsAt: new Date(row.startsAt), status: row.status, kind: row.kind });
    if (!allowed.ok) {
      setError(allowed.reason);
      return;
    }
    const detail = await api.classDetail(row.classSlug);
    setOptions(detail);
    setMoveId(row.id);
  }

  async function moveTo(sessionId?: string, slotId?: string) {
    if (!moveId) return;
    try {
      await api.rescheduleBooking(moveId, { sessionId, slotId });
      await track("booking_rescheduled", { bookingId: moveId });
      setMessage("You're moved. The old time is released.");
      setMoveId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reschedule.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}>
        <Display testID="bookings-title">My bookings</Display>
        {message ? <Body>{message}</Body> : null}
        {error ? <Notice>{error}</Notice> : null}
        {rows.map((row) => (
          <Card key={row.id}>
            <Title>{row.classTitle}</Title>
            <Body muted>{row.status} · {row.kind} · {whenLabel(row.startsAt)}</Body>
            <Body muted>{row.teacherName} · {row.location}</Body>
            <Button label="Add to calendar" tone="ghost" onPress={() => void addToCalendar(calendarEvent({ title: row.classTitle, teacherName: row.teacherName, startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt), location: row.location }))} />
            <Button label="Get help with this booking" tone="ghost" onPress={() => router.push(`/help/${row.id}`)} />
            {row.status === "confirmed" || row.status === "waitlisted" || row.status === "pending" ? <Button label="Cancel" tone="ghost" onPress={() => setCancelId(row.id)} /> : null}
            <Button label="Reschedule" tone="ink" onPress={() => void openMove(row)} />
          </Card>
        ))}
        {!rows.length ? <Body muted>No bookings yet. Explore is a good place to start.</Body> : null}
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(cancelTarget && cancelCopy && cancelCopy.allowed)}
        title="Cancel booking"
        body={cancelCopy && cancelCopy.allowed ? cancelCopy.message : ""}
        confirmLabel="Cancel booking"
        onConfirm={() => void confirmCancel()}
        onClose={() => setCancelId(null)}
      />
      <Sheet visible={Boolean(moveId)} title="Move this booking" onClose={() => setMoveId(null)}>
        {(options?.sessions ?? []).map((session) => (
          <Button key={session.id} label={whenLabel(session.startsAt)} tone="ghost" onPress={() => void moveTo(session.id)} />
        ))}
        {(options?.slots ?? []).map((slot) => (
          <Button key={slot.id} label={`${whenLabel(slot.startsAt)} · ${slot.remaining} left · ${money(slot.priceCents)}`} tone="ghost" onPress={() => void moveTo(undefined, slot.id)} />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}
