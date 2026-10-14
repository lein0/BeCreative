import { openTicket } from "@/lib/support";

export const TICKET_DRAFT_COOKIE = "bc_ticket_draft";

export type TicketDraft = {
  category: string;
  subject: string;
  body: string;
  bookingId: string;
  priority: string;
};

export function ticketDraftFromFields(input: { category: string; subject: string; body: string; bookingId: string; priority: string }): TicketDraft {
  return {
    category: input.category || "class",
    subject: input.subject.slice(0, 200),
    body: input.body.slice(0, 4000),
    bookingId: input.bookingId.slice(0, 80),
    priority: input.priority || "normal",
  };
}

export function parseTicketDraft(raw: string | undefined | null): TicketDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TicketDraft>;
    if (!value || typeof value.subject !== "string" || typeof value.body !== "string") return null;
    return ticketDraftFromFields({
      category: typeof value.category === "string" ? value.category : "class",
      subject: value.subject,
      body: value.body,
      bookingId: typeof value.bookingId === "string" ? value.bookingId : "",
      priority: typeof value.priority === "string" ? value.priority : "normal",
    });
  } catch {
    return null;
  }
}

export function safetyDraftLoginPath() {
  return `/login?next=${encodeURIComponent("/help/safety/resume")}`;
}

export function safetyDraftReady(draft: TicketDraft | null): draft is TicketDraft {
  return Boolean(draft && draft.category === "safety" && draft.subject && draft.body);
}

export async function openSafetyDraft(userId: string, raw: string | undefined | null) {
  const draft = parseTicketDraft(raw);
  if (!safetyDraftReady(draft)) return null;
  return openTicket({
    userId,
    category: "safety",
    subject: draft.subject,
    body: draft.body,
    priority: draft.priority || "normal",
  });
}
