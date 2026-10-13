import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionBox = vi.hoisted(() => ({
  current: null as null | { user: { id: string; name: string; email: string; image: string | null; isDemo: boolean } },
}));

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/lib/test/fake-db");
  return { db: createFakeDb() };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => sessionBox.current } },
}));

const { readTable, resetFakeDb, seedTable } = await import("@/lib/test/fake-db");
const schema = await import("@/lib/db/schema");
const { deleteAccount, sessionAllowedForUser } = await import("@/lib/account-data");
const { getActor } = await import("@/lib/actor");

describe("deleted accounts", () => {
  beforeEach(() => {
    resetFakeDb();
    sessionBox.current = null;
  });

  it("removes provider logins and refuses a new session for the same user", async () => {
    seedTable(schema.user, [{ id: "u1", name: "Sam", email: "sam@example.com", deletedAt: null }]);
    seedTable(schema.account, [{ id: "a1", userId: "u1", providerId: "google", accountId: "google-1" }]);
    seedTable(schema.session, [{ id: "s1", userId: "u1", token: "tok" }]);
    await deleteAccount("u1");
    expect(readTable(schema.account)).toHaveLength(0);
    expect(readTable(schema.session)).toHaveLength(0);
    expect(readTable(schema.user)[0]?.email).toBe("deleted+u1@users.invalid");
    expect(readTable(schema.user)[0]?.deletedAt).toBeInstanceOf(Date);
    sessionBox.current = { user: { id: "u1", name: "Deleted account", email: "deleted+u1@users.invalid", image: null, isDemo: false } };
    await expect(sessionAllowedForUser("u1")).resolves.toBe(false);
    await expect(getActor()).resolves.toBeNull();
    expect(readFileSync("lib/auth.ts", "utf8")).toContain("if (!(await sessionAllowedForUser(userId))) return false;");
  });

  it("still signs in an account that has not been deleted", async () => {
    seedTable(schema.user, [{ id: "u2", deletedAt: null }]);
    seedTable(schema.userRoles, [{ id: "r1", userId: "u2", role: "student" }]);
    sessionBox.current = { user: { id: "u2", name: "Sam", email: "sam@example.com", image: null, isDemo: false } };
    const actor = await getActor();
    expect(actor?.id).toBe("u2");
    expect(actor?.roles).toEqual(["student"]);
  });
});
