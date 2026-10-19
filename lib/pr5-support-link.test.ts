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
const { escalateDueTickets, mergeTickets, openTicket, replyToTicket, resolveTicket } = await import("@/lib/support");
const { openSafetyDraft } = await import("@/lib/ticket-draft");

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

  it("alerts admins when a student replies on a safety, payment, or escalated ticket", async () => {
    seedTable(schema.userRoles, [
      { id: "role-admin", userId: "admin-1", role: "admin" },
      { id: "role-admin-2", userId: "admin-2", role: "admin" },
    ]);
    seedTable(schema.tickets, [{
      id: "t-pay",
      userId: "student-1",
      category: "payment",
      status: "waiting",
      route: "admin",
      subject: "Charged twice",
    }]);
    await replyToTicket({ ticketId: "t-pay", authorUserId: "student-1", body: "Any update?" });
    const admins = notes.sent.filter((note) => note.userId === "admin-1" || note.userId === "admin-2");
    expect(admins.map((note) => note.href)).toEqual(["/admin/support/t-pay", "/admin/support/t-pay"]);
    expect(notes.sent.some((note) => note.userId === "student-1")).toBe(false);

    notes.sent.length = 0;
    await replyToTicket({ ticketId: "t-pay", authorUserId: "admin-1", body: "Refunded", teacherSide: true });
    expect(notes.sent.map((note) => note.userId)).toEqual(["student-1"]);

    notes.sent.length = 0;
    await replyToTicket({ ticketId: "t-pay", authorUserId: "admin-1", body: "Internal only", internal: true });
    expect(notes.sent).toEqual([]);

    notes.sent.length = 0;
    seedTable(schema.teachers, [{ id: "teacher-1", userId: "teacher-user" }]);
    seedTable(schema.tickets, [{
      id: "t-late",
      userId: "student-1",
      teacherId: "teacher-1",
      category: "class",
      status: "open",
      route: "admin",
      subject: "Late",
      escalatedAt: new Date(),
    }]);
    await replyToTicket({ ticketId: "t-late", authorUserId: "student-1", body: "Still waiting", teacherSide: true });
    expect(notes.sent.filter((note) => note.userId === "admin-1" || note.userId === "admin-2")).toHaveLength(2);
    expect(notes.sent.find((note) => note.userId === "teacher-user")?.href).toBe("/teach/support");

    notes.sent.length = 0;
    readTable(schema.tickets)[0]!.route = "teacher";
    await replyToTicket({ ticketId: "t-late", authorUserId: "student-1", body: "Studio only", teacherSide: true });
    expect(notes.sent.some((note) => note.userId === "admin-1" || note.userId === "admin-2")).toBe(false);
    expect(notes.sent.some((note) => note.userId === "teacher-user")).toBe(true);
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

  it("refuses a merge that would orphan the thread or mix students", async () => {
    seedTable(schema.tickets, [
      { id: "src", userId: "student-1", status: "open", subject: "Old" },
      { id: "dst", userId: "student-2", status: "open", subject: "Other student" },
    ]);
    seedTable(schema.ticketMessages, [{ id: "m1", ticketId: "src", body: "Hello", internal: false }]);
    expect(await mergeTickets("src", "")).toEqual({ ok: false });
    expect(await mergeTickets("src", "src")).toEqual({ ok: false });
    expect(await mergeTickets("src", "missing")).toEqual({ ok: false });
    expect(await mergeTickets("src", "dst")).toEqual({ ok: false });
    expect(readTable(schema.tickets).find((ticket) => ticket.id === "src")?.status).toBe("open");
    expect(readTable(schema.ticketMessages)[0]?.ticketId).toBe("src");

    readTable(schema.tickets).find((ticket) => ticket.id === "dst")!.userId = "student-1";
    expect(await mergeTickets("src", "dst")).toEqual({ ok: true });
    expect(readTable(schema.ticketMessages)[0]?.ticketId).toBe("dst");
    expect(readTable(schema.tickets).find((ticket) => ticket.id === "src")?.status).toBe("merged");
  });

  it("files a saved safety report once the writer is signed in", async () => {
    seedTable(schema.user, [{ id: "student-1", name: "Sam", email: "sam@example.com" }]);
    seedTable(schema.userRoles, [{ id: "role-admin", userId: "admin-1", role: "admin" }]);
    const opened = await openSafetyDraft("student-1", JSON.stringify({ category: "safety", subject: "Door stuck", body: "The exit was blocked" }));
    expect(opened?.route).toBe("admin");
    expect(readTable(schema.tickets)[0]).toMatchObject({ userId: "student-1", category: "safety", subject: "Door stuck" });
    expect(readTable(schema.ticketMessages)[0]?.body).toBe("The exit was blocked");
    expect(await openSafetyDraft("student-1", JSON.stringify({ category: "class", subject: "Hi", body: "There" }))).toBeNull();
  });
});
