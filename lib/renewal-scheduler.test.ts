import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const emailOk = vi.hoisted(() => ({ current: true }));
const stopRenewal = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email", ok: emailOk.current })),
  sendIndividually: vi.fn(async () => ({ id: "batch", ok: true })),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return { ...actual, stopSubscriptionRenewal: stopRenewal };
});

const { eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const { sendEmail } = await import("@/lib/email");
const { renewMembershipFromInvoice } = await import("@/lib/booking-service");
const { isoDate } = await import("@/lib/renewal-copy");
const { scheduleRenewalNotices } = await import("@/lib/renewal");

const tag = `renewal-bug-${crypto.randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const teacherIds: string[] = [];
const day = 86_400_000;

function opsMails() {
  return vi.mocked(sendEmail).mock.calls.filter((call) => call[0]?.subject === "Renewal notice needs attention");
}

async function person(name: string) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await db.insert(schema.user).values({ id, name, email: `${tag}-${name}@example.com`, emailVerified: true });
  return id;
}

async function studio(ownerId: string) {
  const id = crypto.randomUUID();
  teacherIds.push(id);
  await db.insert(schema.teachers).values({ id, userId: ownerId, slug: `${tag}-${id.slice(0, 8)}`, studioName: "Studio", status: "approved", bio: "" });
  return id;
}

async function plan(teacherId: string, termMonths: number) {
  const id = crypto.randomUUID();
  await db.insert(schema.memberships).values({
    id, teacherId, slug: `${tag}-${id.slice(0, 8)}`, name: "Monthly studio", termMonths, kind: "limited", classesPerPeriod: 4, priceCents: 14000,
  });
  return id;
}

async function subscription(input: {
  userId: string;
  teacherId: string;
  membershipId: string;
  createdAt: Date;
  periodStart: Date;
  periodEnd: Date;
  renewalPriceCents?: number;
  stripeSubscriptionId?: string;
}) {
  const orderId = crypto.randomUUID();
  await db.insert(schema.orders).values({
    id: orderId,
    userId: input.userId,
    teacherId: input.teacherId,
    kind: "membership",
    status: "paid",
    listPriceCents: 12000,
    studentPaysCents: 12000,
    platformFeeCents: 1200,
    teacherAmountCents: 10800,
    paymentPath: "card",
    stripeSubscriptionId: input.stripeSubscriptionId,
  });
  const id = crypto.randomUUID();
  await db.insert(schema.membershipSubscriptions).values({
    id,
    orderId,
    userId: input.userId,
    membershipId: input.membershipId,
    teacherId: input.teacherId,
    status: "active",
    createdAt: input.createdAt,
    currentPeriodStart: input.periodStart,
    currentPeriodEnd: input.periodEnd,
    renewalPriceCents: input.renewalPriceCents ?? 12000,
    classesPerPeriod: 4,
    unlimited: false,
  });
  return id;
}

describe("renewal scheduler regressions", () => {
  beforeEach(() => {
    emailOk.current = true;
    stopRenewal.mockReset();
    stopRenewal.mockResolvedValue({ ok: true });
    vi.mocked(sendEmail).mockClear();
  });

  afterAll(async () => {
    if (userIds.length) {
      const subs = await db.select({ id: schema.membershipSubscriptions.id }).from(schema.membershipSubscriptions).where(inArray(schema.membershipSubscriptions.userId, userIds));
      const subIds = subs.map((row) => row.id);
      if (subIds.length) await db.delete(schema.renewalNotices).where(inArray(schema.renewalNotices.subscriptionId, subIds));
      await db.delete(schema.orders).where(inArray(schema.orders.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }
    if (teacherIds.length) await db.delete(schema.teachers).where(inArray(schema.teachers.id, teacherIds));
  });

  it("does not cancel a member who joined after a closed plan change", async () => {
    const now = new Date("2026-10-12T12:00:00.000Z");
    const owner = await person("owner-late");
    const earlyStudent = await person("early");
    const lateStudent = await person("late");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 1);
    await db.insert(schema.membershipMaterialChanges).values({
      id: crypto.randomUUID(),
      membershipId,
      summary: "Fewer classes",
      effectiveAt: new Date(now.getTime() - 10 * day),
    });
    const early = await subscription({
      userId: earlyStudent,
      teacherId,
      membershipId,
      createdAt: new Date(now.getTime() - 60 * day),
      periodStart: new Date(now.getTime() - 10 * day),
      periodEnd: new Date(now.getTime() + 20 * day),
    });
    const late = await subscription({
      userId: lateStudent,
      teacherId,
      membershipId,
      createdAt: new Date(now.getTime() - 1 * day),
      periodStart: new Date(now.getTime() - 1 * day),
      periodEnd: new Date(now.getTime() + 29 * day),
    });
    await scheduleRenewalNotices(now, [early, late]);
    const rows = await db.select().from(schema.membershipSubscriptions).where(inArray(schema.membershipSubscriptions.id, [early, late]));
    expect(rows.find((row) => row.id === early)?.cancelAtPeriodEnd).toBe(true);
    expect(rows.find((row) => row.id === late)?.cancelAtPeriodEnd).toBe(false);
  });

  it("leaves the membership active when Stripe refuses the pause, so a paid invoice still extends access", async () => {
    const now = new Date("2026-10-12T12:00:00.000Z");
    stopRenewal.mockRejectedValue(new Error("stripe down"));
    const owner = await person("owner-stripe");
    const student = await person("stripe-student");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 1);
    await db.insert(schema.membershipMaterialChanges).values({
      id: crypto.randomUUID(),
      membershipId,
      summary: "New location",
      effectiveAt: new Date(now.getTime() - 10 * day),
    });
    const periodEnd = new Date(now.getTime() + 20 * day);
    const subId = await subscription({
      userId: student,
      teacherId,
      membershipId,
      createdAt: new Date(now.getTime() - 60 * day),
      periodStart: new Date(now.getTime() - 10 * day),
      periodEnd,
      stripeSubscriptionId: `${tag}-stripe`,
    });
    await scheduleRenewalNotices(now, [subId]);
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    expect(sub?.cancelAtPeriodEnd).toBe(false);
    const extended = await renewMembershipFromInvoice({
      subscriptionId: `${tag}-stripe`,
      invoiceId: `${tag}-invoice`,
      billingReason: "subscription_cycle",
      amountPaidCents: 12000,
      paymentIntentId: null,
      periodStart: periodEnd,
      periodEnd: new Date(periodEnd.getTime() + 30 * day),
    });
    expect(extended.extended).toBe(true);
    expect(opsMails().some((call) => String(call[0]?.text).includes("left active"))).toBe(true);
  });

  it("sends the annual reminder from the original start, not the current period start", async () => {
    const periodEnd = new Date("2026-06-01T12:00:00.000Z");
    const now = new Date(periodEnd.getTime() - 35 * day);
    const owner = await person("owner-annual");
    const student = await person("annual-student");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 1);
    const subId = await subscription({
      userId: student,
      teacherId,
      membershipId,
      createdAt: new Date("2025-06-01T12:00:00.000Z"),
      periodStart: new Date("2026-05-01T12:00:00.000Z"),
      periodEnd,
    });
    await scheduleRenewalNotices(now, [subId]);
    const notices = await db.select().from(schema.renewalNotices).where(eq(schema.renewalNotices.subscriptionId, subId));
    expect(notices.some((notice) => notice.kind === "annual" && notice.status === "sent" && notice.eventOn === isoDate(periodEnd))).toBe(true);
  });

  it("pauses when an annual email failed and the window has closed", async () => {
    const periodEnd = new Date("2026-06-01T12:00:00.000Z");
    const now = new Date(periodEnd.getTime() - 20 * day);
    const owner = await person("owner-failed-annual");
    const student = await person("failed-annual");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 1);
    const subId = await subscription({
      userId: student,
      teacherId,
      membershipId,
      createdAt: new Date("2025-06-01T12:00:00.000Z"),
      periodStart: new Date("2026-05-01T12:00:00.000Z"),
      periodEnd,
    });
    await db.insert(schema.renewalNotices).values({
      id: crypto.randomUUID(),
      userId: student,
      membershipId,
      teacherId,
      subscriptionId: subId,
      kind: "annual",
      eventOn: isoDate(periodEnd),
      status: "failed",
      subject: "Yearly reminder",
      body: "Reminder",
    });
    await scheduleRenewalNotices(now, [subId]);
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    const [notice] = await db.select().from(schema.renewalNotices).where(eq(schema.renewalNotices.subscriptionId, subId));
    expect(sub?.cancelAtPeriodEnd).toBe(true);
    expect(notice?.status).toBe("missed");
  });

  it("records one in-app notice when a failed email is retried", async () => {
    const now = new Date("2026-10-12T12:00:00.000Z");
    emailOk.current = false;
    const owner = await person("owner-retry");
    const student = await person("retry-student");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 12);
    const subId = await subscription({
      userId: student,
      teacherId,
      membershipId,
      createdAt: now,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 35 * day),
    });
    await scheduleRenewalNotices(now, [subId]);
    await scheduleRenewalNotices(now, [subId]);
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, student));
    expect(notes.filter((note) => note.event === "membership.notice")).toHaveLength(1);
  });

  it("alerts operations once when a price notice is missed", async () => {
    const now = new Date("2026-10-12T12:00:00.000Z");
    const owner = await person("owner-price");
    const student = await person("price-student");
    const teacherId = await studio(owner);
    const membershipId = await plan(teacherId, 1);
    await db.insert(schema.membershipPriceChanges).values({
      id: crypto.randomUUID(),
      membershipId,
      oldPriceCents: 12000,
      newPriceCents: 14000,
      effectiveAt: new Date(now.getTime() + 5 * day),
    });
    const subId = await subscription({
      userId: student,
      teacherId,
      membershipId,
      createdAt: new Date(now.getTime() - 40 * day),
      periodStart: new Date(now.getTime() - 10 * day),
      periodEnd: new Date(now.getTime() + 20 * day),
      renewalPriceCents: 12000,
    });
    await scheduleRenewalNotices(now, [subId]);
    expect(opsMails()).toHaveLength(1);
    vi.mocked(sendEmail).mockClear();
    await scheduleRenewalNotices(now, [subId]);
    expect(opsMails()).toHaveLength(0);
    const [sub] = await db.select().from(schema.membershipSubscriptions).where(eq(schema.membershipSubscriptions.id, subId));
    expect(sub?.cancelAtPeriodEnd).toBe(false);
    expect(sub?.renewalPriceCents).toBe(12000);
  });
});
