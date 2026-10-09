import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardPostHog, posthogOptions } from "@/lib/analytics";
import { privacyChoices } from "@/lib/privacy";
import { sentryOptions } from "@/lib/sentry";
import { smsSendDecision } from "@/lib/sms-window";
import { stripeJsSrc } from "@/lib/stripe-js";
import { proxy } from "@/proxy";

describe("session replay stays off", () => {
  it("sets Sentry replay sample rates to zero and does not add a Replay integration", () => {
    expect(sentryOptions.replaysSessionSampleRate).toBe(0);
    expect(sentryOptions.replaysOnErrorSampleRate).toBe(0);
    expect(sentryOptions.integrations).toEqual([]);
    expect(JSON.stringify(sentryOptions)).not.toMatch(/Replay/);
  });

  it("sends PostHog captures with session recording disabled", async () => {
    expect(posthogOptions.disable_session_recording).toBe(true);
    process.env.POSTHOG_KEY = "ph_test";
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await forwardPostHog({ name: "page_view", distinctId: "person", properties: { platform: "web" }, consent: true });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as { properties: { disable_session_recording: boolean } };
    expect(body.properties.disable_session_recording).toBe(true);
    fetchMock.mockClear();
    await forwardPostHog({ name: "page_view", distinctId: "person", properties: {}, consent: false });
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.POSTHOG_KEY;
    vi.unstubAllGlobals();
  });
});

describe("global privacy control", () => {
  it("overrides an earlier accept for analytics and marketing cookies", () => {
    expect(privacyChoices({ gpc: true, accepted: true })).toEqual({ analytics: false, marketing: false, gpc: true });
    expect(privacyChoices({ gpc: false, accepted: true })).toEqual({ analytics: true, marketing: true, gpc: false });
    expect(privacyChoices({ gpc: false, accepted: false })).toEqual({ analytics: false, marketing: false, gpc: false });
  });

  it("drops analytics and marketing cookies when Sec-GPC is 1", () => {
    const response = proxy(new NextRequest("http://localhost:3000/?utm_source=ad&ref=share", {
      headers: { "sec-gpc": "1", cookie: "bc_cookie=1; bc_anon=already; bc_attr=%7B%7D" },
    }));
    expect(response.cookies.get("bc_cookie")?.value).toBe("");
    expect(response.cookies.get("bc_attr")?.value).toBe("");
    expect(response.cookies.get("bc_anon")?.value).toBe("");
    expect(response.headers.get("content-security-policy")).not.toContain("js.stripe.com");
  });
});

describe("Stripe.js checkout routes", () => {
  it("does not load Stripe.js from the site root or the mobile app shell", () => {
    const root = readFileSync("app/layout.tsx", "utf8");
    const site = readFileSync("app/(site)/layout.tsx", "utf8");
    const shell = readFileSync("mobile/app/_layout.tsx", "utf8");
    const provider = readFileSync("mobile/src/stripe/provider.native.tsx", "utf8");
    const checkout = readFileSync("mobile/src/stripe/pay.native.tsx", "utf8");
    for (const source of [root, site, shell, provider]) {
      expect(source).not.toContain("js.stripe.com");
      expect(source).not.toContain("StripeProvider");
    }
    expect(checkout).toContain("StripeProvider");
    expect(stripeJsSrc("/")).toBeNull();
    expect(stripeJsSrc("/c/pottery")).toBeNull();
    expect(stripeJsSrc("/t/maya-alvarez/m/monthly-studio")).toBe("https://js.stripe.com/v3/");
    const home = proxy(new NextRequest("http://localhost:3000/"));
    const membership = proxy(new NextRequest("http://localhost:3000/t/maya-alvarez/m/monthly-studio"));
    expect(home.headers.get("content-security-policy")).not.toContain("js.stripe.com");
    expect(membership.headers.get("content-security-policy")).toContain("https://js.stripe.com");
  });
});

describe("SMS local window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends only from 8:00 a.m. through 7:59 p.m. in the recipient zone, else the class zone", () => {
    const morning = new Date("2026-01-15T15:30:00.000Z");
    const open = smsSendDecision(morning, { recipientTimeZone: "America/New_York", classTimeZone: "America/Los_Angeles" });
    expect(open.timeZone).toBe("America/New_York");
    expect(open.send).toBe(true);
    const tooEarly = smsSendDecision(morning, { classTimeZone: "America/Los_Angeles" });
    expect(tooEarly.timeZone).toBe("America/Los_Angeles");
    expect(tooEarly.send).toBe(false);
    expect(tooEarly.runAt.toISOString()).toBe("2026-01-15T16:00:00.000Z");
    const eight = smsSendDecision(new Date("2026-01-15T16:00:00.000Z"), { classTimeZone: "America/Los_Angeles" });
    expect(eight.send).toBe(true);
    const evening = smsSendDecision(new Date("2026-01-16T03:59:00.000Z"), { recipientTimeZone: "America/Los_Angeles" });
    expect(evening.send).toBe(true);
    const closed = smsSendDecision(new Date("2026-01-16T04:00:00.000Z"), { recipientTimeZone: "America/Los_Angeles" });
    expect(closed.send).toBe(false);
    expect(closed.runAt.toISOString()).toBe("2026-01-16T16:00:00.000Z");
    expect(smsSendDecision(morning, { recipientTimeZone: "Not/AZone", classTimeZone: "America/Chicago" }).timeZone).toBe("America/Chicago");
  });
});
