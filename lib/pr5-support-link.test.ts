import { beforeEach, describe, expect, it, vi } from "vitest";

const notes = vi.hoisted(() => ({ sent: [] as { href?: string; userId: string }[] }));

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});
vi.mock("@/lib/notifications", () => ({
  emitNotification: async (input: { href?: string; userId: string }) => {
    notes.sent.push(input);
  },
}));

const { readTable, resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { escalateDueTickets, openTicket, replyToTicket, resolveTicket } = await import("@/lib/support");

describe("resolved ticket rating link", () => {
  beforeEach(() => {
    resetFakeDb();
    notes.sent.length = 0;
  });

  it("points the student at their ticket, not the admin inbox", async () => {
    seedTable(schema.tickets, [{ id: "t1", userId: "student-1", subject: "Help with scene study", status: "open" }]);
    await resolveTicket("t1");
    expect(notes.sent[0]?.href).toBe("/help/tickets/t1");
    expect(notes.sent[0]?.userId).toBe("student-1");
  });

  it("opens a ticket the student can reach and alerts admins for safety", async () => {
    seedTable(schema.user, [
      { id: "student-1", name: "Sam", email: "sam@example.com" },
      { id: "teacher-user", name: "Maya", email: "maya@example.com" },
    ]);
    seedTable(schema.teachers, [{ id: "teacher-1", userId: "teacher-user" }]);
    seedTable(schema.userRoles, [{ id: "role-admin", userId: "admin-1", role: "admin" }]);
    const safety = await openTicket({ userId: "student-1", category: "safety", subject: "Unsafe room", body: "The door was blocked." });
    expect(notes.sent.find((note) => note.userId === "student-1")?.href).toBe(`/help/tickets/${safety.id}`);
    expect(notes.sent.find((note) => note.userId === "admin-1")?.href).toBe(`/admin/support/${safety.id}`);
    notes.sent.length = 0;
    await openTicket({ userId: "student-1", teacherId: "teacher-1", category: "class", subject: "Where do I stand?", body: "Which mark?" });
    expect(notes.sent.some((note) => note.userId === "admin-1")).toBe(false);
    expect(notes.sent.some((note) => note.userId === "teacher-user")).toBe(true);
  });

  it("keeps a student reply on the studio and a studio reply waiting on the student", async () => {
    seedTable(schema.tickets, [{ id: "t1", userId: "student-1", teacherId: "teacher-1", status: "waiting", subject: "Help" }]);
    seedTable(schema.teachers, [{ id: "teacher-1", userId: "teacher-user" }]);
    await replyToTicket({ ticketId: "t1", authorUserId: "student-1", body: "Still stuck", teacherSide: true });
    expect(readTable(schema.tickets)[0]?.status).toBe("open");
    expect(notes.sent.find((note) => note.userId === "student-1")).toBeUndefined();
    await replyToTicket({ ticketId: "t1", authorUserId: "teacher-user", body: "On it", teacherSide: true });
    expect(readTable(schema.tickets)[0]?.status).toBe("waiting");
    expect(notes.sent.find((note) => note.userId === "student-1")?.href).toBe("/help/tickets/t1");
  });

  it("writes a reply on a merged ticket onto the target thread", async () => {
    seedTable(schema.tickets, [
      { id: "dst", userId: "student-1", status: "waiting", subject: "New" },
      { id: "src", userId: "student-1", status: "merged", mergedIntoId: "dst", subject: "Old" },
    ]);
    await replyToTicket({ ticketId: "src", authorUserId: "student-1", body: "Follow up" });
    expect(readTable(schema.ticketMessages).map((message) => message.ticketId)).toEqual(["dst"]);
    expect(readTable(schema.tickets).find((ticket) => ticket.id === "dst")?.status).toBe("open");
  });

  it("alerts admins when a teacher ticket passes the reply window", async () => {
    seedTable(schema.userRoles, [{ id: "role-admin", userId: "admin-1", role: "admin" }]);
    seedTable(schema.tickets, [{
      id: "t-sla",
      userId: "student-1",
      teacherId: "teacher-1",
      category: "class",
      status: "open",
      route: "teacher",
      subject: "Late",
      createdAt: new Date(Date.now() - 48 * 3_600_000),
      escalatedAt: null,
    }]);
    seedTable(schema.ticketMessages, [{ id: "m1", ticketId: "t-sla", authorUserId: "student-1", body: "Hello", internal: false }]);
    const result = await escalateDueTickets(new Date());
    expect(result.count).toBe(1);
    expect(notes.sent.find((note) => note.userId === "admin-1")?.href).toBe("/admin/support/t-sla");
  });
});
