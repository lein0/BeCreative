import { describe, expect, it, vi } from "vitest";
import { quotePrice } from "../../../lib/pricing";
import { createStudentApi, resolveApiMode } from "./index";
import { fixturePromos } from "./fixtures";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";
import { paths } from "./paths";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures";

describe("api mode", () => {
  it("defaults to mock unless the env is live", () => {
    expect(resolveApiMode(undefined)).toBe("mock");
    expect(resolveApiMode("")).toBe("mock");
    expect(resolveApiMode("live")).toBe("live");
    expect(createStudentApi({}).mode).toBe("mock");
  });
});

describe("mock api", () => {
  it("signs in the demo student and rejects a bad password", async () => {
    const api = createMockApi();
    const session = await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(session.user.name).toBe("Sam Rivera");
    expect(session.token.startsWith("mock:")).toBe(true);
    await expect(api.login({ email: DEMO_EMAIL, password: "nope" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("filters explore by vertical and returns wellness classes", async () => {
    const api = createMockApi();
    const wellness = await api.explore({ vertical: "wellness" });
    expect(wellness.classes.length).toBeGreaterThan(0);
    expect(wellness.classes.every((item) => item.vertical === "wellness")).toBe(true);
    expect(wellness.classes.some((item) => item.offeringKind === "capacity")).toBe(true);
    expect(wellness.classes.some((item) => item.offeringKind === "appointment")).toBe(true);
    const found = await api.explore({ q: "scene", vertical: "creative" });
    expect(found.classes.map((item) => item.slug)).toContain("scene-study");
  });

  it("quotes with the shared pricing helper and opens a PaymentSheet payload", async () => {
    const api = createMockApi();
    const detail = await api.classDetail("scene-study");
    const quote = await api.quote({ classSlug: "scene-study", kind: "session", sessionId: detail.sessions[0].id, promoCode: "BECREATIVE15" });
    const promo = fixturePromos()[0];
    expect(quote.quote).toEqual(quotePrice({ listPriceCents: 3600, feePercent: 10, feeFixedCents: 0, promo }));
    const booked = await api.createBooking(
      {
        classSlug: "scene-study",
        kind: "series",
        promoCode: "MAYA10",
        waiver: { agreed: true, signedName: "Sam Rivera" },
      },
      "idem-1",
    );
    expect(booked.order.payment?.paymentIntentClientSecret).toMatch(/^pi_mock_secret_/);
    expect(booked.order.payment?.merchantDisplayName).toBe("BeCreative");
    expect(booked.booking.status).toBe("pending");
    const again = await api.createBooking(
      { classSlug: "scene-study", kind: "series", waiver: { agreed: true, signedName: "Sam Rivera" } },
      "idem-1",
    );
    expect(again.booking.id).toBe(booked.booking.id);
    const paid = await api.confirmPayment(booked.order.id, "pi_mock");
    expect(paid.status).toBe("paid");
    await expect(api.createBooking({ classSlug: "scene-study", kind: "session", waiver: { agreed: false, signedName: "" } })).rejects.toMatchObject({
      code: "waiver_required",
    });
  });

  it("records track events for ios and android only", async () => {
    const api = createMockApi();
    await api.track({
      event: "class_view",
      platform: "ios",
      occurredAt: "2026-10-08T18:00:00.000Z",
      anonymousId: "anon-1",
      userId: "user-student",
      properties: { slug: "scene-study" },
    });
    expect(api.recordedEvents).toHaveLength(1);
    await expect(api.track({ event: "class_view", platform: "web" as "ios", occurredAt: "", anonymousId: "a", userId: null, properties: {} })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("live api", () => {
  it("posts login and sends the bearer token on later calls", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(paths.login)) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        expect(new Headers(init?.headers).get("authorization")).toBeNull();
        return new Response(JSON.stringify({ token: "tok_123", expiresAt: "2026-11-01T00:00:00.000Z", user: { id: "u", name: "Sam", email: DEMO_EMAIL, emailVerified: true, phone: null, smsOptIn: false, imageUrl: null } }), { status: 200 });
      }
      expect(url).toBe(`https://classes.becreative.app${paths.track}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok_123");
      const body = JSON.parse(String(init?.body));
      expect(body.platform).toBe("android");
      expect(body.event).toBe("checkout_completed");
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    });
    let token: string | null = null;
    const api = createLiveApi({ baseUrl: "https://classes.becreative.app/", getToken: () => token, fetchImpl: fetchImpl as typeof fetch });
    const session = await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    token = session.token;
    await api.track({ event: "checkout_completed", platform: "android", occurredAt: "2026-10-08T18:00:00.000Z", anonymousId: "a", userId: "u", properties: { orderId: "o1" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces API error codes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: "promo_invalid", message: "That code isn't valid." } }), { status: 422 }));
    const api = createLiveApi({ baseUrl: "https://classes.becreative.app", getToken: () => null, fetchImpl: fetchImpl as typeof fetch });
    await expect(api.quote({ classSlug: "scene-study", kind: "session" })).rejects.toMatchObject({ status: 422, code: "promo_invalid" });
  });
});
