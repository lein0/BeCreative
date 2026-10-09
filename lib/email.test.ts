import { describe, expect, it } from "vitest";
import { buildRawEmail } from "@/lib/email-mime";
import { individualDeliveries, sameInbox } from "@/lib/email";

describe("private recipient delivery", () => {
  it("gives each student their own message and drops duplicates", () => {
    const deliveries = individualDeliveries([" Ava@Studio.test ", "sam@studio.test", "ava@studio.test", ""]);
    expect(deliveries).toEqual(["Ava@Studio.test", "sam@studio.test"]);
    const messages = deliveries.map((recipient) => ({ to: [recipient] }));
    expect(messages.every((message) => message.to.length === 1)).toBe(true);
    expect(new Set(messages.flatMap((message) => message.to)).size).toBe(messages.length);
  });

  it("matches a bounce when the stored address differs only by case", () => {
    expect(sameInbox("Jules@Example.com", "jules@example.com")).toBe(true);
    expect(sameInbox("  Jules@Example.com ", "jules@example.com")).toBe(true);
    expect(sameInbox("other@example.com", "jules@example.com")).toBe(false);
  });

  it("strips header breaks and keeps the HTML part", () => {
    const raw = buildRawEmail({
      to: ["student@example.com"],
      subject: "Hello\r\nBcc: evil@example.com",
      text: "plain",
      html: "<p>Hello</p>",
      headers: { "X-Class": "Scene\nstudy" },
    }, "studio@example.com");
    expect(raw.split("\r\n").some((line) => line.startsWith("Bcc:"))).toBe(false);
    expect(raw).toContain("Subject: Hello Bcc: evil@example.com");
    expect(raw).toContain("X-Class: Scene study");
    expect(raw).toContain("Content-Type: text/html; charset=UTF-8");
    expect(raw).toContain("<p>Hello</p>");
  });
});