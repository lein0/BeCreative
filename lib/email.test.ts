import { describe, expect, it } from "vitest";
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
});