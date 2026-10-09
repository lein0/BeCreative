import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const updates: unknown[] = [];
  let event: { id: string; type: string; data: { object: Record<string, unknown> } } = {
    id: "evt_failed",
    type: "invoice.payment_failed",
    data: { object: {} },
  };
  return { updates, get event() { return event; }, set event(value) { event = value; } };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => state.event,
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ id: state.event.id }],
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "order_1" }],
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
  },
}));

vi.mock("@/lib/log", () => ({ logEvent: () => undefined }));

import { POST } from "@/app/api/webhooks/stripe/route";

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  state.updates.length = 0;
});

async function post() {
  return POST(new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "{}",
  }));
}

describe("invoice.payment_failed subscription id", () => {
  it("marks the membership past_due when only the older invoice.subscription field is set", async () => {
    state.event = { id: "evt_old", type: "invoice.payment_failed", data: { object: { subscription: "sub_old" } } };
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.updates).toEqual([{ status: "past_due" }]);
  });

  it("marks the membership past_due from parent.subscription_details", async () => {
    state.event = {
      id: "evt_new",
      type: "invoice.payment_failed",
      data: { object: { parent: { subscription_details: { subscription: "sub_new" } } } },
    };
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.updates).toEqual([{ status: "past_due" }]);
  });
});
