import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/api-token";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, apiTokens, session, user, verification } from "@/lib/db/schema";

const userId = crypto.randomUUID();
const token = `reset-${crypto.randomUUID()}`;

describe("password reset revokes mobile tokens", () => {
  afterAll(async () => {
    await db.delete(verification).where(eq(verification.value, userId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("revokes every API token and web session when the password changes", async () => {
    await db.insert(user).values({ id: userId, name: "Reset", email: `${userId}@example.com`, emailVerified: true });
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const live = crypto.randomUUID();
    const other = crypto.randomUUID();
    await db.insert(apiTokens).values([
      { id: live, userId, tokenHash: hashToken("bc_live"), expiresAt: new Date(Date.now() + 86_400_000) },
      { id: other, userId, tokenHash: hashToken("bc_other"), expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    await db.insert(session).values({
      id: crypto.randomUUID(),
      userId,
      token: `sess-${userId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const result = await auth.api.resetPassword({ body: { newPassword: "new-password-1", token } });
    expect(result).toMatchObject({ status: true });
    const tokens = await db.select().from(apiTokens).where(eq(apiTokens.userId, userId));
    expect(tokens).toHaveLength(2);
    expect(tokens.every((row) => row.revokedAt instanceof Date)).toBe(true);
    const sessions = await db.select().from(session).where(eq(session.userId, userId));
    expect(sessions).toHaveLength(0);
    const credentials = await db.select().from(account).where(eq(account.userId, userId));
    expect(credentials.some((row) => row.providerId === "credential" && row.password)).toBe(true);
  });
});
