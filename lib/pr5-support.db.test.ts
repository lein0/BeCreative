import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/constants";

const actorBox = vi.hoisted(() => ({
  current: {
    id: "student-1",
    name: "Sam",
    email: "sam@example.com",
    image: null as string | null,
    roles: ["student"] as Role[],
    isDemo: false,
  },
}));

const supportBox = vi.hoisted(() => ({
  openTicket: vi.fn(async () => ({ id: "new", route: "teacher" })),
  replyToTicket: vi.fn(async () => undefined),
  resolveTicket: vi.fn(async () => undefined),
  recordCsat: vi.fn(async () => undefined),
  assignTicket: vi.fn(async () => undefined),
  mergeTickets: vi.fn(async () => undefined),
  saveCannedReply: vi.fn(async () => undefined),
}));

const disputeBox = vi.hoisted(() => ({
  addDisputeNote: vi.fn(async () => undefined),
  holdDispute: vi.fn(async () => undefined),
  submitDispute: vi.fn(async () => ({ ok: true })),
  editDisputeSummary: vi.fn(async () => undefined),
  overrideLiability: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});
vi.mock("@/lib/actor", () => ({ requireActor: async () => actorBox.current }));
vi.mock("@/lib/support", () => supportBox);
vi.mock("@/lib/disputes", () => disputeBox);
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { disputeAction, supportReplyAction, ticketAction } = await import("@/lib/support-actions");

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("support actions", () => {
  beforeEach(() => {
    resetFakeDb();
    actorBox.current = { id: "student-1", name: "Sam", email: "sam@example.com", image: null, roles: ["student"], isDemo: false };
    supportBox.openTicket.mockClear();
    supportBox.replyToTicket.mockClear();
    supportBox.resolveTicket.mockClear();
    supportBox.recordCsat.mockClear();
    disputeBox.addDisputeNote.mockClear();
  });

  it("refuses a ticket attached to someone else's booking", async () => {
    seedTable(schema.bookings, [{ id: "book-other", userId: "other", classId: "class-1", orderId: "ord-other" }]);
    seedTable(schema.classes, [{ id: "class-1", teacherId: "teacher-other" }]);
    await expect(ticketAction(form({ bookingId: "book-other", subject: "Hi", body: "Help", category: "class" }))).rejects.toThrow("REDIRECT:/help?error=That%20booking%20is%20not%20on%20your%20account.");
    expect(supportBox.openTicket).not.toHaveBeenCalled();
  });

  it("opens a ticket for the actor's own booking", async () => {
    seedTable(schema.bookings, [{ id: "book-mine", userId: "student-1", classId: "class-1", orderId: "ord-1" }]);
    seedTable(schema.classes, [{ id: "class-1", teacherId: "teacher-1" }]);
    await expect(ticketAction(form({ bookingId: "book-mine", subject: "Hi", body: "Help", category: "class" }))).rejects.toThrow("REDIRECT:/help?sent=1");
    expect(supportBox.openTicket).toHaveBeenCalledWith(expect.objectContaining({ userId: "student-1", teacherId: "teacher-1", bookingId: "book-mine", orderId: "ord-1" }));
  });

  it("stops a stranger from replying, resolving, rating, or posting an internal note", async () => {
    seedTable(schema.tickets, [{ id: "t1", userId: "other", teacherId: "teacher-9", status: "resolved", subject: "Secret" }]);
    await supportReplyAction(form({ ticketId: "t1", command: "reply", body: "injected" }));
    await supportReplyAction(form({ ticketId: "t1", command: "resolve" }));
    await supportReplyAction(form({ ticketId: "t1", command: "csat", score: "1" }));
    await supportReplyAction(form({ ticketId: "t1", body: "secret note", internal: "1" }));
    expect(supportBox.replyToTicket).not.toHaveBeenCalled();
    expect(supportBox.resolveTicket).not.toHaveBeenCalled();
    expect(supportBox.recordCsat).not.toHaveBeenCalled();
  });

  it("lets the ticket owner rate a resolved ticket and the studio resolve its own", async () => {
    seedTable(schema.tickets, [{ id: "t1", userId: "student-1", teacherId: "teacher-1", status: "resolved", subject: "Mine" }]);
    await expect(supportReplyAction(form({ ticketId: "t1", command: "csat", score: "4", back: "/help/tickets/t1" }))).rejects.toThrow("REDIRECT:/help/tickets/t1");
    expect(supportBox.recordCsat).toHaveBeenCalledWith("t1", 4);
    await supportReplyAction(form({ ticketId: "t1", command: "resolve" }));
    expect(supportBox.resolveTicket).not.toHaveBeenCalled();

    actorBox.current = { id: "teacher-user", name: "Maya", email: "maya@example.com", image: null, roles: ["teacher"], isDemo: false };
    seedTable(schema.teachers, [{ id: "teacher-1", userId: "teacher-user" }]);
    await expect(supportReplyAction(form({ ticketId: "t1", command: "resolve", back: "/teach/support" }))).rejects.toThrow("REDIRECT:/teach/support");
    expect(supportBox.resolveTicket).toHaveBeenCalledWith("t1");
  });

  it("refuses dispute notes from a teacher who does not own the sale", async () => {
    seedTable(schema.disputes, [{ id: "dp_1", teacherId: "studio-a" }]);
    seedTable(schema.teachers, [{ id: "studio-b", userId: "student-1" }]);
    await disputeAction(form({ disputeId: "dp_1", command: "note", body: "not my sale" }));
    expect(disputeBox.addDisputeNote).not.toHaveBeenCalled();

    actorBox.current = { id: "teacher-user", name: "Maya", email: "maya@example.com", image: null, roles: ["teacher"], isDemo: false };
    seedTable(schema.teachers, [{ id: "studio-a", userId: "teacher-user" }]);
    await expect(disputeAction(form({ disputeId: "dp_1", command: "note", body: "They checked in", back: "/teach/disputes" }))).rejects.toThrow("REDIRECT:/teach/disputes");
    expect(disputeBox.addDisputeNote).toHaveBeenCalledWith("dp_1", "teacher-user", "They checked in");
  });
});
