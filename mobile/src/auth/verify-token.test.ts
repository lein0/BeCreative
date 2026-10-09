import { describe, expect, it } from "vitest";
import { shouldConfirmVerification } from "./verify-token";

describe("verification token", () => {
  it("confirms the first token and a later one, and skips a repeat", () => {
    expect(shouldConfirmVerification(null, "")).toBe(false);
    expect(shouldConfirmVerification(null, "token-a")).toBe(true);
    expect(shouldConfirmVerification("token-a", "token-a")).toBe(false);
    expect(shouldConfirmVerification("token-a", "token-b")).toBe(true);
  });
});
