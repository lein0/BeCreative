import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const updates: { values: unknown; where: unknown }[] = [];
  let orders: { id: string }[] = [{ id: "order_1" }];
  let event: { id: string; type: string; data: { object: Record<string, unknown> } } = {
    id: "evt_failed",
    type: "invoice.payment_failed",
    data: { object: {} },
  };
  return {
    updates,
    get orders() { return orders; },
    set orders(value) { orders = value; },
    get event() { return event; },
    set event(value) { event = value; },
  };
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
        where: async () => state.orders,
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async (where: unknown) => {
          state.updates.push({ values, where });
        },
      }),
    }),
  },
}));

vi.mock("@/lib/log", () => ({ logEvent: () => undefined }));

import { POST } from "@/app/api/webhooks/stripe/route";

function sqlText(clause: unknown) {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as { constructor?: { name?: string }; value?: unknown; queryChunks?: unknown[] };
    if (record.constructor?.name === "StringChunk" && Array.isArray(record.value)) {
      for (const item of record.value) if (typeof item === "string") parts.push(item);
      return;
    }
    if (record.constructor?.name === "Param" && (typeof record.value === "string" || typeof record.value === "number")) {
      parts.push(String(record.value));
      return;
    }
    if (Array.isArray(record.queryChunks)) visit(record.queryChunks);
  };
  visit(clause);
  return parts.join("");
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  state.updates.length = 0;
  state.orders = [{ id: "order_1" }];
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
    expect(state.updates.map((row) => row.values)).toEqual([{ status: "past_due" }]);
  });

  it("marks the membership past_due from parent.subscription_details", async () => {
    state.event = {
      id: "evt_new",
      type: "invoice.payment_failed",
      data: { object: { parent: { subscription_details: { subscription: "sub_new" } } } },
    };
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.updates.map((row) => row.values)).toEqual([{ status: "past_due" }]);
  });

  it("updates the original membership when a renewal order is listed first", async () => {
    state.orders = [{ id: "renewal:in_9" }, { id: "order_original" }];
    state.event = { id: "evt_renewal", type: "invoice.payment_failed", data: { object: { subscription: "sub_cycle" } } };
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]?.values).toEqual({ status: "past_due" });
    const where = sqlText(state.updates[0]?.where);
    expect(where).toContain("renewal:in_9");
    expect(where).toContain("order_original");
  });
});
