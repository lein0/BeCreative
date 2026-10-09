import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const { handleMobileApi } = await import("@/lib/mobile-api");
const { hashToken } = await import("@/lib/api-token");
const { eq } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");

function call(path: string, init?: RequestInit) {
  return handleMobileApi(new Request(`http://localhost/api/v1/${path}`, init), path.split("/").filter(Boolean));
}

function post(path: string, body: unknown) {
  return call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("student API route gates", () => {
  it("requires an Apple or Google identity token", async () => {
    const missing = await post("auth/social", {});
    expect(missing.status).toBe(400);
    const unconfigured = await post("auth/social", { provider: "apple", idToken: "native-token" });
    expect(unconfigured.status).toBe(503);
    const google = await post("auth/social", { provider: "google", idToken: "native-token" });
    expect(google.status).toBe(503);
  });

  it("rejects incomplete password reset and email verification requests", async () => {
    expect((await post("auth/password/request", {})).status).toBe(400);
    expect((await post("auth/password/confirm", { token: "reset-token", password: "short" })).status).toBe(400);
    expect((await post("auth/email/request", {})).status).toBe(400);
    expect((await post("auth/email/confirm", {})).status).toBe(400);
  });

  it("requires a signed-in student before account deletion", async () => {
    const response = await call("me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "DemoPass123!" }) });
    expect(response.status).toBe(401);
  });
});

const created = { userId: "", bookingId: "", sessionIds: [] as string[] };

describe("student API catalog contract", () => {
  afterAll(async () => {
    if (created.bookingId) await db.delete(schema.bookings).where(eq(schema.bookings.id, created.bookingId));
    if (created.sessionIds.length) {
      const { inArray } = await import("drizzle-orm");
      await db.delete(schema.sessions).where(inArray(schema.sessions.id, created.sessionIds));
    }
    if (created.userId) await db.delete(schema.user).where(eq(schema.user.id, created.userId));
  });

  it("returns coordinates, teacher prices, waiver flags, and booking times", async () => {
    const explore = await call("explore");
    const listed = await explore.json() as { classes: { slug: string; lat: number | null; lng: number | null; neighborhood: string | null; location: { neighborhood: string } | null }[] };
    const inPerson = listed.classes.find((row) => row.slug === "32-bars");
    const virtual = listed.classes.find((row) => row.slug === "audition-cut");
    expect(inPerson?.neighborhood).toBe("Hollywood");
    expect(inPerson?.location?.neighborhood).toBe("Hollywood");
    expect(typeof inPerson?.lat).toBe("number");
    expect(typeof inPerson?.lng).toBe("number");
    expect(virtual?.lat).toBeNull();
    expect(virtual?.location).toBeNull();

    const search = await handleMobileApi(new Request("http://localhost/api/v1/search?q=yoga"), ["search"]);
    const found = await search.json() as { services: { slug: string; neighborhood: string | null; lat: number | null }[] };
    const yoga = found.services.find((row) => row.slug === "private-yoga");
    expect(yoga?.neighborhood).toBe("Silver Lake");
    expect(typeof yoga?.lat).toBe("number");

    const teacher = await call("teachers/maya-alvarez");
    const profile = await teacher.json() as { packs: { id: string; priceCents: number; creditCount: number }[]; memberships: { id: string; priceCents: number }[] };
    expect(profile.packs.map((pack) => pack.priceCents).sort()).toEqual([15000, 28000]);
    expect(profile.packs.every((pack) => pack.id && pack.creditCount > 0)).toBe(true);
    expect(profile.memberships.every((plan) => plan.id && plan.priceCents > 0)).toBe(true);

    const plain = await call("classes/32-bars");
    const plainBody = await plain.json() as { signatureRequired: boolean; policyAcknowledgementRequired: boolean; class: { neighborhood: string | null } };
    expect(plainBody.signatureRequired).toBe(false);
    expect(plainBody.policyAcknowledgementRequired).toBe(true);
    expect(plainBody.class.neighborhood).toBe("Hollywood");

    const waivered = await call("classes/morning-vinyasa");
    const waiveredBody = await waivered.json() as { signatureRequired: boolean };
    expect(waiveredBody.signatureRequired).toBe(true);

    const userId = crypto.randomUUID();
    created.userId = userId;
    const raw = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(schema.user).values({ id: userId, name: "API Student", email: `api-${userId}@example.com`, emailVerified: true });
    await db.insert(schema.apiTokens).values({ id: crypto.randomUUID(), userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 86_400_000) });
    const [klass] = await db.select({ id: schema.classes.id }).from(schema.classes).where(eq(schema.classes.slug, "32-bars")).limit(1);
    const pastId = crypto.randomUUID();
    const nextId = crypto.randomUUID();
    const laterId = crypto.randomUUID();
    created.sessionIds.push(pastId, nextId, laterId);
    const bookingId = crypto.randomUUID();
    created.bookingId = bookingId;
    await db.insert(schema.sessions).values([
      { id: pastId, classId: klass!.id, startsAt: new Date("2020-01-01T18:00:00Z"), endsAt: new Date("2020-01-01T19:00:00Z"), localDate: "2020-01-01", capacity: 8 },
      { id: nextId, classId: klass!.id, startsAt: new Date("2027-03-01T18:00:00Z"), endsAt: new Date("2027-03-01T19:00:00Z"), localDate: "2027-03-01", capacity: 8 },
      { id: laterId, classId: klass!.id, startsAt: new Date("2027-04-01T18:00:00Z"), endsAt: new Date("2027-04-01T19:00:00Z"), localDate: "2027-04-01", capacity: 8 },
    ]);
    await db.insert(schema.bookings).values({ id: bookingId, userId, classId: klass!.id, kind: "drop_in", status: "confirmed" });
    await db.insert(schema.bookingSessions).values([
      { id: crypto.randomUUID(), bookingId, sessionId: pastId },
      { id: crypto.randomUUID(), bookingId, sessionId: nextId },
      { id: crypto.randomUUID(), bookingId, sessionId: laterId },
    ]);
    const bookings = await handleMobileApi(new Request("http://localhost/api/v1/bookings", { headers: { authorization: `Bearer ${raw}` } }), ["bookings"]);
    const mine = await bookings.json() as { bookings: { id: string; startsAt: string; endsAt: string; timezone: string; location: { neighborhood: string } | null }[] };
    const row = mine.bookings.find((item) => item.id === bookingId);
    expect(row?.timezone).toBe("America/Los_Angeles");
    expect(row?.location?.neighborhood).toBe("Hollywood");
    expect(new Date(row!.startsAt).toISOString()).toBe("2027-03-01T18:00:00.000Z");
    expect(new Date(row!.endsAt).toISOString()).toBe("2027-03-01T19:00:00.000Z");

    const waiver = await handleMobileApi(new Request("http://localhost/api/v1/waivers/riley-park", { headers: { authorization: `Bearer ${raw}` } }), ["waivers", "riley-park"]);
    const waiverBody = await waiver.json() as { required: boolean; policyAcknowledgementRequired: boolean; signed: boolean };
    expect(waiverBody.required).toBe(false);
    expect(waiverBody.policyAcknowledgementRequired).toBe(true);
    expect(waiverBody.signed).toBe(false);
  });
});
