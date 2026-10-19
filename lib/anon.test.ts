import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { experimentSubject } from "@/lib/anon";
import { capture, stitchFromCookies } from "@/lib/analytics";
import { stitchSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyticsEvents } from "@/lib/db/schema";
import { subjectFromCookies } from "@/lib/experiments";
import { proxy } from "@/proxy";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, header: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "bc_anon" && state.cookie ? { value: state.cookie } : undefined),
  }),
  headers: async () => ({
    get: (name: string) => (name === "x-bc-anon" ? state.header : null),
  }),
}));

describe("first-visit experiment subject", () => {
  it("uses the id minted on this request instead of the user id or anonymous", async () => {
    expect(experimentSubject({ header: "minted-anon", userId: "user-1" })).toBe("minted-anon");
    expect(experimentSubject({ cookie: "cookie-anon", header: "other", userId: "user-1" })).toBe("cookie-anon");
    expect(experimentSubject({ userId: "user-1" })).toBe("user-1");
    expect(experimentSubject({})).toBeNull();
    expect(experimentSubject({ cookie: "anonymous", header: "anonymous", userId: "anonymous" })).toBeNull();
    expect(experimentSubject({ cookie: "anonymous", userId: "user-1" })).toBe("user-1");
    state.cookie = undefined;
    state.header = "minted-anon";
    await expect(subjectFromCookies("user-1")).resolves.toBe("minted-anon");
    state.cookie = "cookie-anon";
    await expect(subjectFromCookies("user-1")).resolves.toBe("cookie-anon");
  });

  it("writes one anonymous id onto the cookie and the forwarded request", () => {
    const response = proxy(new NextRequest("http://localhost:3000/c/pottery"));
    const cookie = response.cookies.get("bc_anon")?.value;
    expect(cookie).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-middleware-request-x-bc-anon")).toBe(cookie);
  });

  it("stores the minted anonymous id when the first-visit cookie is not on the request yet", async () => {
    state.cookie = undefined;
    state.header = "minted-for-capture";
    const saved = await capture({ name: "page_view" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const [row] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, saved.id));
    expect(row?.anonymousId).toBe("minted-for-capture");
    expect(row?.userId).toBeNull();
    state.header = "anonymous";
    const dropped = await capture({ name: "page_view" });
    expect(dropped.ok).toBe(true);
    if (dropped.ok) {
      const [blank] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, dropped.id));
      expect(blank?.anonymousId).toBeNull();
      await db.delete(analyticsEvents).where(eq(analyticsEvents.id, dropped.id));
    }
    state.cookie = "cookie-anon";
    state.header = "minted-for-capture";
    const preferred = await capture({ name: "class_viewed" });
    expect(preferred.ok).toBe(true);
    if (preferred.ok) {
      const [cookieRow] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, preferred.id));
      expect(cookieRow?.anonymousId).toBe("cookie-anon");
      await db.delete(analyticsEvents).where(eq(analyticsEvents.id, preferred.id));
    }
    state.cookie = undefined;
    state.header = "minted-for-capture";
    await stitchFromCookies("stitched-user");
    const [stitched] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, saved.id));
    expect(stitched?.userId).toBe("stitched-user");
    await db.delete(analyticsEvents).where(eq(analyticsEvents.id, saved.id));
  });

  it("stitches anonymous events when a session is created for Google sign-in", async () => {
    state.cookie = "google-visitor";
    state.header = null;
    const saved = await capture({ name: "page_view", path: "/from-google", userId: null });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await stitchSessionUser("google-user");
    const [row] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.id, saved.id));
    expect(row?.anonymousId).toBe("google-visitor");
    expect(row?.userId).toBe("google-user");
    expect(readFileSync("lib/auth.ts", "utf8")).toContain("await stitchSessionUser(userId)");
    await db.delete(analyticsEvents).where(eq(analyticsEvents.id, saved.id));
  });

  it("keeps an anonymous id that is already on the request", () => {
    const request = new NextRequest("http://localhost:3000/c/pottery", { headers: { cookie: "bc_anon=already-there" } });
    const response = proxy(request);
    expect(response.cookies.get("bc_anon")).toBeUndefined();
    expect(response.headers.get("x-middleware-request-x-bc-anon")).toBeNull();
  });
});
