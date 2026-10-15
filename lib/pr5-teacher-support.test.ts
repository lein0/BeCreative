import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/support-actions", () => ({ supportReplyAction: async () => undefined }));
vi.mock("@/lib/actor", () => ({ requireActor: async () => ({ id: "teacher-user" }) }));
vi.mock("@/lib/queries", () => ({ teacherByUser: async () => ({ id: "teacher-1" }) }));
vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});

const { teacherTicketPanel } = await import("@/app/(site)/teach/support/page");

describe("teacher support inbox", () => {
  it("lets the studio resolve an open ticket without sending a reply", () => {
    const html = renderToStaticMarkup(teacherTicketPanel({
      id: "t1",
      subject: "Where do I stand?",
      status: "waiting",
      route: "teacher",
      slaDueAt: null,
    }, []));
    expect(html).toContain('name="command" value="resolve"');
    expect(html).toContain("Mark resolved");
    const resolveForm = html.slice(html.indexOf('name="command" value="resolve"'));
    expect(resolveForm).not.toContain("required");
  });

  it("hides resolve on a ticket that is already resolved or merged", () => {
    const resolved = renderToStaticMarkup(teacherTicketPanel({
      id: "t1",
      subject: "Done",
      status: "resolved",
      route: "teacher",
      slaDueAt: null,
    }, []));
    expect(resolved).not.toContain('value="resolve"');
    const merged = renderToStaticMarkup(teacherTicketPanel({
      id: "t2",
      subject: "Merged",
      status: "merged",
      route: "teacher",
      slaDueAt: null,
    }, []));
    expect(merged).not.toContain('value="resolve"');
    expect(merged).toContain("Merged");
  });
});
