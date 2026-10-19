import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const wheres: unknown[] = [];
  return { wheres };
});

vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: (clause: unknown) => {
          state.wheres.push(clause);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

import { POST } from "@/app/api/webhooks/ses/route";

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
    if (Array.isArray(record.queryChunks)) visit(record.queryChunks);
  };
  visit(clause);
  return parts.join("");
}

beforeEach(() => {
  process.env.SES_WEBHOOK_SECRET = "secret";
  state.wheres.length = 0;
});

describe("SES bounce matching", () => {
  it("suppresses a stored address that differs only by case", async () => {
    const response = await POST(new Request("http://localhost/api/webhooks/ses?token=secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notificationType: "Bounce",
        bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "Jules@Example.com" }] },
      }),
    }));
    expect(response.status).toBe(200);
    const where = sqlText(state.wheres[0]).toLowerCase();
    expect(where).toContain("lower(");
    expect(where).toContain("jules@example.com");
  });
});
