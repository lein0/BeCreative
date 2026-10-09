import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApprovedPayload } from "@/lib/feedback-rules";
import { bearerMatches, deliverWebhook, feedbackSignatureHeader, signFeedbackBody } from "@/lib/feedback-webhook";

const payload = buildApprovedPayload(
  {
    id: "fb_1",
    title: null,
    body: "The pin overlaps the label",
    type: "bug",
    priority: "normal",
    status: "approved",
    sensitive: false,
    url: "https://classes.example/explore",
    route: "/explore",
    selector: "main > h1",
    element_text: "Explore",
    targets: [{ selector: "main > h1", text: "Explore" }],
    marks: [{ type: "box", x: 10, y: 20, w: 40, h: 16 }],
    viewport: { w: 1280, h: 800, dpr: 1.5, scroll_x: 0, scroll_y: 40 },
    device: "desktop",
    screenshot_url: "https://classes.example/api/media/feedback/shot.jpg",
    author: { id: "user_1", name: "Avery Chen", email: "admin@becreative.demo", role: "admin" },
    approved_by: "user_1",
    approved_at: "2026-10-08T00:00:00.000Z",
    fix_pr_url: null,
    fix_notes: null,
    created_at: "2026-10-08T00:00:00.000Z",
    comments: [],
  },
  "2026-10-08T00:00:01.000Z",
);

describe("feedback webhook signature", () => {
  it("signs the raw body with HMAC-SHA256 and sends the bearer key", async () => {
    const body = JSON.stringify(payload);
    const secret = "test-secret";
    const seen: { signature: string; authorization: string; body: string }[] = [];
    const attempts = await deliverWebhook("https://fixer.example/hook", body, {
      secret,
      key: "sender-key",
      delays: [5, 5],
      sleep: async () => {},
      fetch: async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        seen.push({ signature: headers["x-feedback-signature"], authorization: headers.authorization, body: String(init?.body) });
        return new Response(null, { status: 200 });
      },
    });
    expect(attempts).toEqual([{ attempt: 1, status: "delivered", httpStatus: 200, error: null }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.authorization).toBe("Bearer sender-key");
    expect(seen[0]?.body).toBe(body);
    expect(seen[0]?.signature).toBe(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
    expect(signFeedbackBody(secret, body)).not.toBe(signFeedbackBody(secret, `${body} `));
    expect(feedbackSignatureHeader(secret, body)).toBe(seen[0]?.signature);
    expect(payload.event).toBe("feedback.approved");
    expect(payload.item.sensitive).toBe(false);
  });

  it("retries with backoff and keeps every failed attempt", async () => {
    const slept: number[] = [];
    let calls = 0;
    const attempts = await deliverWebhook("https://fixer.example/hook", "{}", {
      secret: "test-secret",
      key: "sender-key",
      delays: [250, 1000],
      sleep: async (ms) => {
        slept.push(ms);
      },
      fetch: async () => {
        calls += 1;
        if (calls < 3) return new Response("busy", { status: 503 });
        throw new Error("socket hang up");
      },
    });
    expect(calls).toBe(3);
    expect(slept).toEqual([250, 1000]);
    expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3]);
    expect(attempts[0]).toMatchObject({ status: "failed", httpStatus: 503 });
    expect(attempts[2]).toMatchObject({ status: "failed", error: "socket hang up" });
  });

  it("stops retrying after a successful delivery", async () => {
    let calls = 0;
    const attempts = await deliverWebhook("https://fixer.example/hook", "{}", {
      secret: "test-secret",
      delays: [10, 10],
      sleep: async () => {},
      fetch: async () => {
        calls += 1;
        return new Response(calls === 1 ? "no" : "ok", { status: calls === 1 ? 500 : 200 });
      },
    });
    expect(calls).toBe(2);
    expect(attempts.map((attempt) => attempt.status)).toEqual(["failed", "delivered"]);
  });

  it("does not call the webhook when the signing secret is missing", async () => {
    let calls = 0;
    const attempts = await deliverWebhook("https://fixer.example/hook", "{}", {
      secret: "",
      sleep: async () => {},
      fetch: async () => {
        calls += 1;
        return new Response("ok", { status: 200 });
      },
    });
    expect(calls).toBe(0);
    expect(attempts[0]?.error).toMatch(/FEEDBACK_WEBHOOK_SECRET/);
  });
});

describe("feedback callback auth", () => {
  it("accepts only the full bearer token", () => {
    expect(bearerMatches("Bearer callback-token", "callback-token")).toBe(true);
    expect(bearerMatches("bearer callback-token", "callback-token")).toBe(true);
    expect(bearerMatches("Bearer wrong-token", "callback-token")).toBe(false);
    expect(bearerMatches("Bearer callback-token-extra", "callback-token")).toBe(false);
    expect(bearerMatches("callback-token", "callback-token")).toBe(false);
    expect(bearerMatches(null, "callback-token")).toBe(false);
    expect(bearerMatches("Bearer callback-token", undefined)).toBe(false);
    expect(bearerMatches("Bearer callback-token", "")).toBe(false);
  });
});
