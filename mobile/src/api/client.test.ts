import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { quotePrice } from "../../../lib/pricing";
import { createStudentApi, resolveApiMode } from "./index";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROMO } from "./fixtures";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";
import { documentedPaths, paths } from "./paths";
import { friendlySocialError } from "../auth/messages";
import { checkoutKind } from "../checkout/kind";
import { mapPins, whenLabel } from "../format";

describe("api mode", () => {
  it("uses the real API when a URL is set, and mock when the flag says so", () => {
    expect(resolveApiMode(undefined, undefined)).toBe("mock");
    expect(resolveApiMode("", "")).toBe("mock");
    expect(resolveApiMode(undefined, "http://localhost:3000")).toBe("live");
    expect(resolveApiMode("mock", "http://localhost:3000")).toBe("mock");
    expect(createStudentApi({}).mode).toBe("mock");
  });
});

describe("mock api", () => {
  it("signs in the demo student and rejects a bad password", async () => {
    const api = createMockApi();
    const session = await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(session.user.name).toBe("Jules Navarro");
    expect(session.token.startsWith("bc_")).toBe(true);
    await expect(api.signIn({ email: DEMO_EMAIL, password: "nope" })).rejects.toMatchObject({ status: 401 });
  });

  it("filters explore by vertical", async () => {
    const api = createMockApi();
    const wellness = await api.explore({ vertical: "wellness" });
    expect(wellness.classes.length).toBeGreaterThan(0);
    expect(wellness.classes.every((item) => item.vertical === "wellness")).toBe(true);
    const found = await api.explore({ q: "scene", vertical: "creative" });
    expect(found.classes.map((item) => item.slug)).toContain("scene-study");
  });

  it("prices a promo with the shared helper and returns a PaymentSheet secret", async () => {
    const api = createMockApi();
    await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const detail = await api.classDetail("scene-study");
    const booked = await api.book({ sessionId: detail.slots[0]!.id, code: "BECREATIVE15", policyAccepted: true, paymentSheet: true });
    const quote = quotePrice({ listPriceCents: 3600, feePercent: 10, feeFixedCents: 0, promo: DEMO_PROMO });
    expect(booked.listPriceCents).toBe(quote.listPriceCents);
    expect(booked.discountCents).toBe(quote.discountCents);
    expect(booked.studentPaysCents).toBe(quote.studentPaysCents);
    expect(booked.clientSecret).toMatch(/^pi_mock_secret_/);
    expect(checkoutKind(booked)).toBe("sheet");
    await expect(api.book({ sessionId: detail.slots[0]!.id, policyAccepted: false })).rejects.toMatchObject({ status: 400 });
  });

  it("returns a Checkout Session URL for memberships", async () => {
    const api = createMockApi();
    await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const bought = await api.purchaseMembership({ id: "plan-1" });
    expect(checkoutKind(bought)).toBe("browser");
    expect(bought.checkoutUrl).toMatch(/^https:\/\//);
    expect(bought.clientSecret).toBeUndefined();
  });

  it("lists packs, pins in-person classes, and times bookings in the class zone", async () => {
    const api = createMockApi();
    const teacher = await api.teacher("maya-alvarez");
    expect(teacher.packs[0]).toMatchObject({ slug: "scene-5", creditCount: 5 });
    const explore = await api.explore({ vertical: "creative" });
    const pins = mapPins(explore.classes);
    expect(pins.every((item) => item.delivery !== "virtual")).toBe(true);
    expect(explore.classes.some((item) => item.delivery === "virtual" && item.lat == null)).toBe(true);
    await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const bookings = await api.bookings();
    expect(bookings.bookings[0]?.timezone).toBe("America/Los_Angeles");
    expect(bookings.bookings[0]?.startsAt).toBeTruthy();
    expect(whenLabel("2026-10-08T19:00:00.000Z", "America/New_York")).toContain("3:00");
    const detail = await api.classDetail("morning-flow");
    expect(detail.signatureRequired).toBe(false);
    expect(detail.policyAcknowledgementRequired).toBe(true);
    const waiver = await api.waiver("lena-ortiz");
    expect(waiver.required).toBe(false);
  });

  it("resets a password, verifies email, and deletes only after re-auth", async () => {
    const api = createMockApi();
    await expect(api.requestPasswordReset("student@becreative.demo")).resolves.toEqual({ ok: true });
    await expect(api.confirmPasswordReset({ token: "", password: "long-enough" })).rejects.toMatchObject({ status: 400 });
    await expect(api.confirmEmailVerification("token-1")).resolves.toEqual({ ok: true });
    await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    await expect(api.deleteAccount({})).rejects.toMatchObject({ status: 400 });
    await expect(api.deleteAccount({ password: "nope" })).rejects.toMatchObject({ status: 401 });
    const social = await api.signInSocial({ provider: "apple", idToken: "unconfigured", nonce: "n" }).catch((err: unknown) => err);
    expect(social).toMatchObject({ status: 503 });
    expect(friendlySocialError("apple", 503, "Apple sign-in is not configured.")).toContain("sign in with email");
    await expect(api.deleteAccount({ password: DEMO_PASSWORD })).resolves.toEqual({ ok: true });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
  });

  it("records catalog track events", async () => {
    const api = createMockApi();
    await api.track({ name: "class_viewed", platform: "ios", anonymousId: "anon-1", properties: { slug: "scene-study" } });
    expect(api.recordedEvents).toHaveLength(1);
    expect(api.recordedEvents[0]?.name).toBe("class_viewed");
  });
});

describe("live api", () => {
  it("posts sign-in and sends the bearer token and platform header", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url.endsWith(paths.signIn)) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        expect(headers.get("authorization")).toBeNull();
        expect(headers.get("x-platform")).toBe("ios");
        return new Response(JSON.stringify({ token: "bc_tok", user: { id: "u", name: "Jules", email: DEMO_EMAIL } }), { status: 200 });
      }
      expect(url).toBe(`https://classes.becreative.app${paths.track}`);
      expect(headers.get("authorization")).toBe("Bearer bc_tok");
      const body = JSON.parse(String(init?.body));
      expect(body.name).toBe("checkout_completed");
      expect(body.properties.orderId).toBe("o1");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    let token: string | null = null;
    const api = createLiveApi({
      baseUrl: "https://classes.becreative.app/",
      getToken: () => token,
      getPlatform: () => "ios",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const session = await api.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    token = session.token;
    await api.track({ name: "checkout_completed", platform: "ios", anonymousId: "a", properties: { orderId: "o1" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("posts the social id token and deletes with a password", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(paths.social)) {
        expect(JSON.parse(String(init?.body))).toEqual({ provider: "google", idToken: "id-1", nonce: "nonce-1" });
        return new Response(JSON.stringify({ error: "Google sign-in is not configured." }), { status: 503 });
      }
      expect(url.endsWith(paths.deleteMe)).toBe(true);
      expect(init?.method).toBe("DELETE");
      expect(JSON.parse(String(init?.body))).toEqual({ password: DEMO_PASSWORD });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const api = createLiveApi({ baseUrl: "https://classes.becreative.app", getToken: () => "bc_tok", fetchImpl: fetchImpl as typeof fetch });
    await expect(api.signInSocial({ provider: "google", idToken: "id-1", nonce: "nonce-1" })).rejects.toMatchObject({ status: 503, message: "Google sign-in is not configured." });
    await expect(api.deleteAccount({ password: DEMO_PASSWORD })).resolves.toEqual({ ok: true });
  });

  it("reads the API error string", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "That code isn't recognized." }), { status: 400 }));
    const api = createLiveApi({ baseUrl: "https://classes.becreative.app", getToken: () => "bc_tok", fetchImpl: fetchImpl as typeof fetch });
    await expect(api.book({ sessionId: "s", code: "NOPE", policyAccepted: true })).rejects.toMatchObject({ status: 400, message: "That code isn't recognized." });
  });

  it("calls only paths published in the OpenAPI document", () => {
    const yaml = readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8");
    const published = new Set([...yaml.matchAll(/^  (\/[^:\s]+):/gm)].map((match) => match[1]));
    for (const path of documentedPaths) expect(published.has(path)).toBe(true);
  });
});
