import { describe, expect, it } from "vitest";
import { paymentPortalFeatures, paymentPortalSessionParams } from "@/lib/stripe";

describe("payment method portal", () => {
  it("opens a card update that cannot cancel the subscription", () => {
    const features = paymentPortalFeatures();
    expect(features.payment_method_update.enabled).toBe(true);
    expect(features.subscription_cancel.enabled).toBe(false);
    expect(features.subscription_update.enabled).toBe(false);
    const session = paymentPortalSessionParams("cus_123", "https://northwind.test/account/memberships/sub/payment", "bpc_card");
    expect(session.customer).toBe("cus_123");
    expect(session.configuration).toBe("bpc_card");
    expect(session.flow_data.type).toBe("payment_method_update");
    expect(session.flow_data.after_completion).toEqual({
      type: "redirect",
      redirect: { return_url: "https://northwind.test/account/memberships/sub/payment" },
    });
    expect(session.flow_data).not.toHaveProperty("subscription_cancel");
  });
});
