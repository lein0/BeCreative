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

const { resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { resolveTicket } = await import("@/lib/support");

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
});
