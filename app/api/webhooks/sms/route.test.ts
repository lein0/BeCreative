import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/messaging", () => ({
  applySmsKeyword: vi.fn(),
  sendKeywordReply: vi.fn(async () => ({ ok: true })),
}));

import { applySmsKeyword, sendKeywordReply } from "@/lib/messaging";
import { POST } from "@/app/api/webhooks/sms/route";

const reply = "You are opted out of BeCreative texts. Reply START to opt in again.";

beforeEach(() => {
  process.env.SMS_WEBHOOK_SECRET = "secret";
  vi.mocked(applySmsKeyword).mockReset();
  vi.mocked(sendKeywordReply).mockClear();
});

describe("SMS keyword webhook", () => {
  it("answers a Twilio form post with TwiML instead of JSON", async () => {
    vi.mocked(applySmsKeyword).mockResolvedValue({ keyword: "stop", reply });
    const response = await POST(new Request("http://localhost/api/webhooks/sms?token=secret", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: "+13105550100", Body: "STOP" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/xml");
    const xml = await response.text();
    expect(xml).toContain("<Response><Message>");
    expect(xml).toContain("opted out");
    expect(sendKeywordReply).not.toHaveBeenCalled();
  });

  it("sends HELP and START replies for a JSON inbound message", async () => {
    vi.mocked(applySmsKeyword).mockResolvedValue({ keyword: "help", reply: "BeCreative class reminders. Reply STOP to opt out." });
    const response = await POST(new Request("http://localhost/api/webhooks/sms", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ originationNumber: "+13105550100", messageBody: "HELP" }),
    }));
    expect(response.status).toBe(200);
    expect(sendKeywordReply).toHaveBeenCalledWith("+13105550100", "BeCreative class reminders. Reply STOP to opt out.");
  });
});
