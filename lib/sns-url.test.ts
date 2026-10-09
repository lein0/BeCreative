import { describe, expect, it } from "vitest";
import { snsSubscribeUrlAllowed } from "@/lib/sns-url";

describe("SNS confirmation hosts", () => {
  it("allows only sns region hosts", () => {
    expect(snsSubscribeUrlAllowed("https://sns.us-west-2.amazonaws.com/?Action=ConfirmSubscription")).toBe(true);
    expect(snsSubscribeUrlAllowed("https://sns.us-east-1.amazonaws.com/")).toBe(true);
    expect(snsSubscribeUrlAllowed("http://sns.us-west-2.amazonaws.com/")).toBe(false);
    expect(snsSubscribeUrlAllowed("https://evil.example/sns.us-west-2.amazonaws.com")).toBe(false);
    expect(snsSubscribeUrlAllowed("https://sns.us-west-2.amazonaws.com.evil.example/")).toBe(false);
    expect(snsSubscribeUrlAllowed("https://example.com/")).toBe(false);
  });
});
