import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const authApi = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: authApi },
  emailVerificationRequired: () => process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
}));

const { handleMobileApi } = await import("@/lib/mobile-api");
const { exposeExperiment } = await import("@/lib/experiments");
const { saveClass } = await import("@/lib/studio-service");
const { dispatchStripeEvent } = await import("@/app/api/webhooks/stripe/route");

const tag = `pr7b-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
const categoryIds: string[] = [];
const experimentIds: string[] = [];

async function person(name: string, emailVerified = true) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified });
  return id;
}

describe("PR 7 remaining bugbot regressions", () => {
  afterAll(async () => {
    if (experimentIds.length) await db.delete(schema.experiments).where(inArray(schema.experiments.id, experimentIds));
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
    if (userIds.length) {
      await db.delete(schema.analyticsEvents).where(inArray(schema.analyticsEvents.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }
    if (categoryIds.length) await db.delete(schema.categories).where(inArray(schema.categories.id, categoryIds));
    await db.delete(schema.analyticsEvents).where(sql`${schema.analyticsEvents.anonymousId} like ${`${tag}%`}`);
    await db.delete(schema.rateBuckets).where(sql`${schema.rateBuckets.key} like ${`%${tag}%`}`);
  });

  it("does not issue a bearer token for an unverified signup when verification is required", async () => {
    const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    authApi.signUpEmail.mockImplementation(async (input: { body: { email?: string; name?: string } }) => {
      const id = await person(input.body.email?.includes("verified") ? `verified-${crypto.randomUUID().slice(0, 6)}` : `new-${crypto.randomUUID().slice(0, 6)}`, Boolean(input.body.email?.includes("verified")));
      return { user: { id, name: input.body.name || "New", email: input.body.email || "", emailVerified: Boolean(input.body.email?.includes("verified")) } };
    });
    const signup = (email: string, ip: string) => handleMobileApi(new Request("http://localhost/api/v1/auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "correct horse battery", name: "New Student" }),
    }), ["auth", "sign-up"]);
    try {
      const blocked = await signup(`${tag}-plain@example.com`, `${tag}-plain`);
      expect(blocked.status).toBe(200);
      const blockedBody = await blocked.json() as { token?: string; verificationRequired?: boolean };
      expect(blockedBody.verificationRequired).toBe(true);
      expect(blockedBody.token).toBeUndefined();
      const tokens = await db.select().from(schema.apiTokens).where(inArray(schema.apiTokens.userId, userIds));
      expect(tokens).toHaveLength(0);

      const allowed = await signup(`${tag}-verified@example.com`, `${tag}-verified`);
      expect(allowed.status).toBe(200);
      const allowedBody = await allowed.json() as { token?: string };
      expect(allowedBody.token).toMatch(/^bc_/);
    } finally {
      if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
      else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
    }
  });

  it("issues a signup token when the website does not require verification", async () => {
    const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    try {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-open` },
        body: JSON.stringify({ email: `${tag}-open@example.com`, password: "correct horse battery", name: "Open" }),
      }), ["auth", "sign-up"]);
      expect(response.status).toBe(200);
      const body = await response.json() as { token?: string; verificationRequired?: boolean };
      expect(body.token).toMatch(/^bc_/);
      expect(body.verificationRequired).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
      else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
    }
  });

  it("throttles student sign-up the same way as sign-in", async () => {
    const ip = `${tag}-limit`;
    let status = 200;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: `${tag}-limit-${attempt}@example.com`, password: "correct horse battery", name: "Limit" }),
      }), ["auth", "sign-up"]);
      status = response.status;
    }
    expect(status).toBe(429);
  });

  it("does not issue a sign-in token for an unverified email when verification is required", async () => {
    const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    const userId = await person("signin-plain", false);
    authApi.signInEmail.mockResolvedValue({ user: { id: userId, name: "Plain", email: `${tag}-signin-plain@example.com`, emailVerified: false } });
    try {
      const response = await handleMobileApi(new Request("http://localhost/api/v1/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-signin` },
        body: JSON.stringify({ email: `${tag}-signin-plain@example.com`, password: "secret" }),
      }), ["auth", "sign-in"]);
      expect(response.status).toBe(403);
      const body = await response.json() as { token?: string; verificationRequired?: boolean };
      expect(body.verificationRequired).toBe(true);
      expect(body.token).toBeUndefined();
      const tokens = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, userId));
      expect(tokens).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
      else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
    }
  });

  it("records experiment exposure only while the test is running", async () => {
    const experimentId = crypto.randomUUID();
    experimentIds.push(experimentId);
    const key = `${tag}-hero`;
    await db.insert(schema.experiments).values({ id: experimentId, key, name: "Hero", status: "draft", goalEvent: "checkout_completed" });
    await db.insert(schema.experimentVariants).values({ id: crypto.randomUUID(), experimentId, key: "control", weight: 1, payload: {} });
    const subject = `${tag}-subject`;
    const draft = await exposeExperiment(key, subject);
    expect(draft?.variant).toBe("control");
    const draftRows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, subject));
    expect(draftRows).toHaveLength(0);
    await db.update(schema.experiments).set({ status: "running" }).where(eq(schema.experiments.id, experimentId));
    await exposeExperiment(key, subject);
    await exposeExperiment(key, subject);
    await db.update(schema.experiments).set({ status: "stopped", winnerVariant: "control" }).where(eq(schema.experiments.id, experimentId));
    await exposeExperiment(key, subject);
    const rows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.anonymousId, subject));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("experiment_exposed");
  });

  it("fires class_published only on the transition to published", async () => {
    const owner = await person("publish-owner");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-publish`, studioName: "Publish", status: "approved", bio: "" });
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Publish", slug: `${tag}-publish-cat` });
    const input = {
      actorUserId: owner,
      teacherId,
      delegated: false,
      title: `${tag} scene`,
      description: "A class",
      outcomes: "",
      prerequisites: "",
      whatToBring: "",
      categoryId,
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      virtualLink: "https://example.com/room",
      maxSize: 8,
      durationMinutes: 60,
      pricePerSessionCents: 2000,
      pricePerSeriesCents: null,
      seriesBookingEnabled: false,
      firstClassFree: false,
      waitlistEnabled: false,
      publish: true,
    };
    const created = await saveClass(input);
    expect("classId" in created).toBe(true);
    if (!("classId" in created)) return;
    await saveClass({ ...input, classId: created.classId, title: `${tag} scene updated` });
    const events = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, owner));
    expect(events.filter((event) => event.name === "class_published")).toHaveLength(1);
  });

  it("records stripe_connected only the first time charges turn on", async () => {
    const owner = await person("stripe-owner");
    const teacherId = crypto.randomUUID();
    teacherIds.push(teacherId);
    const accountId = `acct_${tag}`;
    await db.insert(schema.teachers).values({ id: teacherId, userId: owner, slug: `${tag}-stripe`, studioName: "Stripe", status: "approved", bio: "", stripeAccountId: accountId, stripeChargesEnabled: false });
    const event = (id: string) => ({
      id,
      type: "account.updated",
      data: { object: { id: accountId, charges_enabled: true, details_submitted: true, payouts_enabled: true, requirements: { currently_due: [] } } },
    }) as unknown as Stripe.Event;
    await dispatchStripeEvent(event(`evt_${tag}_1`));
    await dispatchStripeEvent(event(`evt_${tag}_2`));
    const events = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, owner));
    expect(events.filter((event) => event.name === "stripe_connected")).toHaveLength(1);
    const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
    expect(teacher?.stripeChargesEnabled).toBe(true);
  });

  it("rejects tickets that attach another student's booking or an unrelated teacher", async () => {
    const owner = await person("ticket-owner");
    const student = await person("ticket-student");
    const other = await person("ticket-other");
    const teacherId = crypto.randomUUID();
    const strangerId = crypto.randomUUID();
    teacherIds.push(teacherId, strangerId);
    await db.insert(schema.teachers).values([
      { id: teacherId, userId: owner, slug: `${tag}-ticket`, studioName: "Tickets", status: "approved", bio: "" },
      { id: strangerId, userId: await person("ticket-stranger"), slug: `${tag}-stranger`, studioName: "Stranger", status: "approved", bio: "" },
    ]);
    const categoryId = crypto.randomUUID();
    categoryIds.push(categoryId);
    await db.insert(schema.categories).values({ id: categoryId, name: "Tickets", slug: `${tag}-ticket-cat` });
    const classId = crypto.randomUUID();
    await db.insert(schema.classes).values({
      id: classId,
      teacherId,
      categoryId,
      slug: `${tag}-ticket-class`,
      title: "Help class",
      skillLevel: "all",
      format: "class",
      delivery: "virtual",
      maxSize: 8,
      durationMinutes: 60,
      status: "published",
    });
    const bookingId = crypto.randomUUID();
    await db.insert(schema.bookings).values({ id: bookingId, userId: student, classId, kind: "session", status: "confirmed" });
    async function bearer(userId: string) {
      const raw = `bc_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(schema.apiTokens).values({ id: crypto.randomUUID(), userId, tokenHash: (await import("@/lib/api-token")).hashToken(raw), expiresAt: new Date(Date.now() + 86_400_000) });
      return raw;
    }
    const post = (token: string, body: Record<string, string>) => handleMobileApi(new Request("http://localhost/api/v1/tickets", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": `${tag}-tickets` },
      body: JSON.stringify({ category: "class", subject: "Help", body: "Question", ...body }),
    }), ["tickets"]);
    const stolen = await post(await bearer(other), { bookingId });
    expect(stolen.status).toBe(404);
    const stranger = await post(await bearer(student), { teacherId: strangerId });
    expect(stranger.status).toBe(403);
    const opened = await post(await bearer(student), { bookingId, teacherId });
    expect(opened.status).toBe(200);
    const tickets = await db.select().from(schema.tickets).where(eq(schema.tickets.userId, student));
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.bookingId).toBe(bookingId);
    expect(tickets[0]?.teacherId).toBe(teacherId);
    const outsider = await db.select().from(schema.tickets).where(eq(schema.tickets.userId, other));
    expect(outsider).toHaveLength(0);
  });
});
