import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/actor", () => ({
  getActor: async () => ({ id: "logged-in-user", name: "Sam", email: "sam@example.com", image: null, roles: ["student"], isDemo: false }),
}));

const { db } = await import("@/lib/db");
const { analyticsEvents } = await import("@/lib/db/schema");
const { capture } = await import("@/lib/analytics");

describe("logged-in capture identity", () => {
  it("stores the session user on page views that do not pass a user id", async () => {
    const saved = await capture({ name: "page_view", path: "/explore", platform: "web" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const search = await capture({ name: "search", path: "/explore", platform: "web", properties: { q: "scene" } });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    const explicit = await capture({ name: "page_view", path: "/anonymous", userId: null, anonymousId: "keep-separate" });
    expect(explicit.ok).toBe(true);
    const rows = await db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, "logged-in-user"));
    const ids = new Set([saved.id, search.id]);
    expect(rows.filter((row) => ids.has(row.id)).map((row) => row.name).sort()).toEqual(["page_view", "search"]);
    if (explicit.ok) {
      const [kept] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, explicit.id));
      expect(kept?.userId).toBeNull();
      expect(kept?.anonymousId).toBe("keep-separate");
      await db.delete(analyticsEvents).where(eq(analyticsEvents.id, explicit.id));
    }
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, "logged-in-user"));
  });
});
