import { config } from "dotenv";
import { afterAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });
process.env.REQUIRE_EMAIL_VERIFICATION = "true";

const { eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { auth } = await import("@/lib/auth");
const { hashToken } = await import("@/lib/api-token");
const { handleMobileApi } = await import("@/lib/mobile-api");

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client";
process.env.APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "test-apple-client";

const userIds: string[] = [];
const teacherIds: string[] = [];
const categoryIds: string[] = [];

function bearer(token: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", crypto.randomUUID());
  return handleMobileApi(new Request(`http://localhost/api/v1/${path}`, { ...init, headers }), path.split("/").filter(Boolean));
}

async function student(name: string, emailVerified = false) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `bugbot-${id}@example.com`, emailVerified });
  const raw = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(schema.apiTokens).values({
    id: crypto.randomUUID(),
    userId: id,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { id, raw, email: `bugbot-${id}@example.com` };
}

describe("student API bugbot regressions", () => {
  afterAll(async () => {
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (categoryIds.length) await db.delete(schema.categories).where(inArray(schema.categories.id, categoryIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  it("shows the next scheduled date when a cancelled or skipped session is sooner", async () => {
    const person = await student("Booker", true);
    const ownerId = crypto.randomUUID();
    userIds.push(ownerId);
    await db.insert(schema.user).values({ id: ownerId, name: "Owner", email: `bugbot-owner-${ownerId}@example.com`, emailVerified: true });
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: ownerId, slug: `bugbot-${teacherId.slice(0, 8)}`, studioName: "Studio", status: "approved", bio: "" });
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Acting", slug: `bugbot-${categoryId.slice(0, 8)}` });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `bugbot-class-${classId.slice(0, 8)}`,
      title: "Scene study",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 2500,
      status: "published",
    });
    const cancelledId = crypto.randomUUID();
    const skippedId = crypto.randomUUID();
    const scheduledId = crypto.randomUUID();
    const onlyCancelledId = crypto.randomUUID();
    await db.insert(schema.sessions).values([
      { id: cancelledId, classId, startsAt: new Date("2027-02-01T18:00:00Z"), endsAt: new Date("2027-02-01T19:00:00Z"), localDate: "2027-02-01", capacity: 8, status: "cancelled" },
      { id: skippedId, classId, startsAt: new Date("2027-02-15T18:00:00Z"), endsAt: new Date("2027-02-15T19:00:00Z"), localDate: "2027-02-15", capacity: 8, status: "scheduled", exception: "skipped" },
      { id: scheduledId, classId, startsAt: new Date("2027-04-01T18:00:00Z"), endsAt: new Date("2027-04-01T19:00:00Z"), localDate: "2027-04-01", capacity: 8, status: "scheduled" },
      { id: onlyCancelledId, classId, startsAt: new Date("2027-05-01T18:00:00Z"), endsAt: new Date("2027-05-01T19:00:00Z"), localDate: "2027-05-01", capacity: 8, status: "cancelled", exception: "skipped" },
    ]);
    const bookingId = crypto.randomUUID();
    const emptyId = crypto.randomUUID();
    await db.insert(schema.bookings).values([
      { id: bookingId, userId: person.id, classId, kind: "series", status: "confirmed" },
      { id: emptyId, userId: person.id, classId, kind: "drop_in", status: "confirmed" },
    ]);
    await db.insert(schema.bookingSessions).values([
      { id: crypto.randomUUID(), bookingId, sessionId: cancelledId },
      { id: crypto.randomUUID(), bookingId, sessionId: skippedId },
      { id: crypto.randomUUID(), bookingId, sessionId: scheduledId },
      { id: crypto.randomUUID(), bookingId: emptyId, sessionId: onlyCancelledId },
    ]);

    const response = await bearer(person.raw, "bookings");
    const body = await response.json() as { bookings: { id: string; startsAt: string | null; endsAt: string | null }[] };
    const series = body.bookings.find((row) => row.id === bookingId);
    const dropped = body.bookings.find((row) => row.id === emptyId);
    expect(new Date(series!.startsAt!).toISOString()).toBe("2027-04-01T18:00:00.000Z");
    expect(new Date(series!.endsAt!).toISOString()).toBe("2027-04-01T19:00:00.000Z");
    expect(dropped?.startsAt).toBeNull();
    expect(dropped?.endsAt).toBeNull();
  });

  it("deletes an unverified account when the password matches", async () => {
    const person = await student("Unverified", false);
    const password = "StudioPass123!";
    const hash = await (await auth.$context).password.hash(password);
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId: person.id,
      accountId: person.id,
      providerId: "credential",
      password: hash,
    });
    const signInEmail = vi.spyOn(auth.api, "signInEmail").mockRejectedValue(new Error("EMAIL_NOT_VERIFIED"));
    try {
      const wrong = await bearer(person.raw, "me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "not-the-password" }),
      });
      expect(wrong.status).toBe(401);
      const [still] = await db.select({ deletedAt: schema.user.deletedAt }).from(schema.user).where(eq(schema.user.id, person.id));
      expect(still?.deletedAt).toBeNull();

      const right = await bearer(person.raw, "me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      expect(right.status).toBe(200);
      expect(signInEmail).not.toHaveBeenCalled();
      const [gone] = await db.select({ deletedAt: schema.user.deletedAt, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, person.id));
      expect(gone?.deletedAt).toBeTruthy();
      expect(gone?.email).toBe(`deleted+${person.id}@users.invalid`);
    } finally {
      signInEmail.mockRestore();
    }
  });

  it("proves a social identity for deletion without creating an account", async () => {
    const person = await student("Social", true);
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId: person.id,
      accountId: "sub-actor",
      providerId: "google",
    });
    const ctx = await auth.$context;
    const previous = ctx.socialProviders.slice();
    ctx.socialProviders.unshift({
      id: "google",
      options: {},
      idToken: {
        verify: async (token: string) => token === "matching-token" || token === "other-token",
      },
      async getUserInfo(token: { idToken?: string }) {
        return {
          user: { name: "Student", email: "hide@privaterelay.appleid.com", emailVerified: true },
          data: { sub: token.idToken === "matching-token" ? "sub-actor" : "sub-other" },
        };
      },
      accountSubject({ profile }: { profile: { sub?: string } }) {
        return profile.sub ?? "";
      },
    } as (typeof ctx.socialProviders)[number]);
    const signInSocial = vi.spyOn(auth.api, "signInSocial").mockRejectedValue(new Error("reauth must not create an account"));
    try {
      const mismatch = await bearer(person.raw, "me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", idToken: "other-token" }),
      });
      expect(mismatch.status).toBe(401);
      const [kept] = await db.select({ deletedAt: schema.user.deletedAt }).from(schema.user).where(eq(schema.user.id, person.id));
      expect(kept?.deletedAt).toBeNull();
      const orphans = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "hide@privaterelay.appleid.com"));
      expect(orphans).toHaveLength(0);

      const match = await bearer(person.raw, "me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", idToken: "matching-token" }),
      });
      expect(match.status).toBe(200);
      expect(signInSocial).not.toHaveBeenCalled();
      const [gone] = await db.select({ deletedAt: schema.user.deletedAt }).from(schema.user).where(eq(schema.user.id, person.id));
      expect(gone?.deletedAt).toBeTruthy();
    } finally {
      signInSocial.mockRestore();
      ctx.socialProviders.splice(0, ctx.socialProviders.length, ...previous);
    }
  });

  it("does not sign a deleted account back in with the same social identity", async () => {
    const deletedId = crypto.randomUUID();
    userIds.push(deletedId);
    await db.insert(schema.user).values({
      id: deletedId,
      name: "Deleted account",
      email: `deleted+${deletedId}@users.invalid`,
      emailVerified: true,
      deletedAt: new Date(),
    });
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId: deletedId,
      accountId: "apple-sub-deleted",
      providerId: "apple",
    });
    await db.insert(schema.session).values({
      id: crypto.randomUUID(),
      userId: deletedId,
      token: `leftover-${deletedId}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    let createdId = "";
    let calls = 0;
    const signInSocial = vi.spyOn(auth.api, "signInSocial").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          redirect: false,
          url: undefined,
          user: { id: deletedId, name: "Deleted account", email: `deleted+${deletedId}@users.invalid` },
        } as never;
      }
      createdId = crypto.randomUUID();
      userIds.push(createdId);
      const email = `bugbot-new-${createdId}@example.com`;
      await db.insert(schema.user).values({ id: createdId, name: "New Student", email, emailVerified: true });
      return { redirect: false, url: undefined, user: { id: createdId, name: "New Student", email } } as never;
    });
    try {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ provider: "apple", idToken: "apple-id-token" }),
      }), ["auth", "social"]);
      const body = await response.json() as { token?: string; user?: { id: string }; error?: string };
      expect(response.status).toBe(200);
      expect(calls).toBe(2);
      expect(body.user?.id).toBe(createdId);
      expect(body.user?.id).not.toBe(deletedId);
      const me = await bearer(body.token!, "auth/me");
      expect(me.status).toBe(200);
      const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, deletedId));
      expect(sessions).toHaveLength(0);
      const links = await db.select().from(schema.account).where(eq(schema.account.userId, deletedId));
      expect(links).toHaveLength(0);
      const deletedTokens = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, deletedId));
      expect(deletedTokens).toHaveLength(0);
    } finally {
      signInSocial.mockRestore();
    }
  });

  it("does not link Apple or Google onto an unverified local account", async () => {
    const person = await student("Reserved", false);
    const ctx = await auth.$context;
    const previous = ctx.socialProviders.slice();
    ctx.socialProviders.unshift({
      id: "google",
      options: {},
      idToken: { verify: async (token: string) => token === "reserved-token" },
      async getUserInfo() {
        return { user: { name: "Reserved", email: person.email, emailVerified: true }, data: { sub: "sub-reserved" } };
      },
      accountSubject({ profile }: { profile: { sub?: string } }) {
        return profile.sub ?? "";
      },
    } as unknown as (typeof ctx.socialProviders)[number]);
    const signInSocial = vi.spyOn(auth.api, "signInSocial").mockResolvedValue({ redirect: false, url: undefined, user: { id: person.id, name: "Reserved", email: person.email } } as never);
    try {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ provider: "google", idToken: "reserved-token" }),
      }), ["auth", "social"]);
      expect(response.status).toBe(401);
      expect(signInSocial).not.toHaveBeenCalled();
    } finally {
      signInSocial.mockRestore();
      ctx.socialProviders.splice(0, ctx.socialProviders.length, ...previous);
    }
  });

  it("releases a deleted social login when the first sign-in throws", async () => {
    const deletedId = crypto.randomUUID();
    userIds.push(deletedId);
    await db.insert(schema.user).values({
      id: deletedId,
      name: "Deleted account",
      email: `deleted+${deletedId}@users.invalid`,
      emailVerified: true,
      deletedAt: new Date(),
    });
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId: deletedId,
      accountId: "apple-sub-thrown",
      providerId: "apple",
    });
    const ctx = await auth.$context;
    const previous = ctx.socialProviders.slice();
    ctx.socialProviders.unshift({
      id: "apple",
      options: {},
      idToken: { verify: async () => true },
      async getUserInfo() {
        return { user: { name: "New", email: "fresh-social@example.com", emailVerified: true }, data: { sub: "apple-sub-thrown" } };
      },
      accountSubject({ profile }: { profile: { sub?: string } }) {
        return profile.sub ?? "";
      },
    } as unknown as (typeof ctx.socialProviders)[number]);
    let calls = 0;
    const createdId = crypto.randomUUID();
    userIds.push(createdId);
    const signInSocial = vi.spyOn(auth.api, "signInSocial").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("deleted session rejected");
      const email = `bugbot-fresh-${createdId}@example.com`;
      await db.insert(schema.user).values({ id: createdId, name: "Fresh", email, emailVerified: true });
      return { redirect: false, url: undefined, user: { id: createdId, name: "Fresh", email } } as never;
    });
    try {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ provider: "apple", idToken: "apple-thrown" }),
      }), ["auth", "social"]);
      const body = await response.json() as { user?: { id: string } };
      expect(response.status).toBe(200);
      expect(calls).toBe(2);
      expect(body.user?.id).toBe(createdId);
      const links = await db.select().from(schema.account).where(eq(schema.account.userId, deletedId));
      expect(links).toHaveLength(0);
    } finally {
      signInSocial.mockRestore();
      ctx.socialProviders.splice(0, ctx.socialProviders.length, ...previous);
    }
  });

  it("returns ok when a reset or verification email cannot be sent", async () => {
    const reset = vi.spyOn(auth.api, "requestPasswordReset").mockRejectedValue(new Error("unknown"));
    const verify = vi.spyOn(auth.api, "sendVerificationEmail").mockRejectedValue(new Error("unknown"));
    try {
      const password = await handleMobileApi(new Request("http://localhost/api/v1/auth/password/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ email: "missing@example.com" }),
      }), ["auth", "password", "request"]);
      const email = await handleMobileApi(new Request("http://localhost/api/v1/auth/email/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ email: "missing@example.com" }),
      }), ["auth", "email", "request"]);
      expect(password.status).toBe(200);
      expect(email.status).toBe(200);
      expect(await password.json()).toEqual({ ok: true });
      expect(await email.json()).toEqual({ ok: true });
    } finally {
      reset.mockRestore();
      verify.mockRestore();
    }
  });
});
