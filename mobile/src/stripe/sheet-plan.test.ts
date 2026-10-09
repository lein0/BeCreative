import { describe, expect, it } from "vitest";
import { paymentSheetPlan } from "./sheet-plan";

describe("payment sheet plan", () => {
  it("does not complete a live secret when no real publishable key is available", () => {
    expect(paymentSheetPlan({ clientSecret: "pi_live_secret", envKey: "", apiKey: "pk_test_mock" })).toEqual({ kind: "unavailable" });
    expect(paymentSheetPlan({ clientSecret: "pi_live_secret" })).toEqual({ kind: "unavailable" });
  });

  it("uses the API publishable key when the env key is unset", () => {
    expect(paymentSheetPlan({ clientSecret: "pi_3secret", apiKey: "pk_test_51abc" })).toEqual({ kind: "sheet", publishableKey: "pk_test_51abc" });
  });

  it("keeps fixture secrets on the mock path", () => {
    expect(paymentSheetPlan({ clientSecret: "pi_mock_secret_order-1" })).toEqual({ kind: "mock" });
  });
});
