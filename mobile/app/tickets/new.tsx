import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ApiError } from "@mobile/api";
import { Body, Button, Display, Field, Notice, Screen } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function NewTicket() {
  const params = useLocalSearchParams<{ bookingId?: string; subject?: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [subject, setSubject] = useState(typeof params.subject === "string" ? params.subject : "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const ticket = await api.createTicket({ bookingId: typeof params.bookingId === "string" ? params.bookingId : null, subject, body });
      setSent(ticket.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that.");
    }
  }

  return (
    <Screen>
      <Display>Support</Display>
      <Body muted>A person reads this. Include the class and what you need.</Body>
      {error ? <Notice>{error}</Notice> : null}
      {sent ? <Body>Ticket {sent} is open.</Body> : null}
      <Field label="Subject" value={subject} onChangeText={setSubject} />
      <Field label="What happened" value={body} onChangeText={setBody} />
      <Button label="Send" onPress={() => void submit()} />
      <Button label="Back" tone="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
