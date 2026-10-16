import { describe, expect, it } from "vitest";
import { invoiceSubscriptionId } from "@/lib/stripe-invoice";

describe("invoice subscription id", () => {
  it("reads the current parent field and the older invoice.subscription field", () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: "sub_parent_obj" } } } })).toBe("sub_parent_obj");
    expect(invoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
    expect(invoiceSubscriptionId({ subscription: { id: "sub_obj" } })).toBe("sub_obj");
    expect(invoiceSubscriptionId({ subscription: null, parent: { subscription_details: { subscription: "sub_parent" } } })).toBe("sub_parent");
    expect(invoiceSubscriptionId({})).toBeNull();
  });
});
