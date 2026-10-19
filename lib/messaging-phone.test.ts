import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const updates: { table: unknown; set?: unknown; where?: unknown }[] = [];
  const inserts: { table: unknown; values?: unknown }[] = [];
  const deletes: { table: unknown; where?: unknown }[] = [];
  function chain(kind: "update" | "insert" | "delete", table: unknown) {
    const record: { table: unknown; set?: unknown; values?: unknown; where?: unknown } = { table };
    if (kind === "update") updates.push(record);
    if (kind === "insert") inserts.push(record);
    if (kind === "delete") deletes.push(record);
    const api = {
      set(values: unknown) {
        record.set = values;
        return api;
      },
      values(values: unknown) {
        record.values = values;
        return api;
      },
      where(clause: unknown) {
        record.where = clause;
        return api;
      },
      onConflictDoNothing() {
        return api;
      },
    };
    return api;
  }
  return { updates, inserts, deletes, chain };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: (table: unknown) => state.chain("update", table),
    insert: (table: unknown) => state.chain("insert", table),
    delete: (table: unknown) => state.chain("delete", table),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));

import { smsSuppressions, user } from "@/lib/db/schema";
import { applySmsKeyword } from "@/lib/messaging";

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
  state.updates.length = 0;
  state.inserts.length = 0;
  state.deletes.length = 0;
});

describe("STOP and START phone matching", () => {
  it("opts out a stored 310-555-0100 when STOP arrives as +13105550100", async () => {
    const result = await applySmsKeyword("+13105550100", "STOP");
    expect(result.keyword).toBe("stop");
    expect(state.inserts[0]?.table).toBe(smsSuppressions);
    expect(state.inserts[0]?.values).toMatchObject({ phone: "+13105550100", reason: "stop" });
    expect(state.updates[0]?.table).toBe(user);
    expect(state.updates[0]?.set).toEqual({ smsOptIn: false });
    const where = sqlText(state.updates[0]?.where);
    expect(where).toContain("3105550100");
    expect(where).toContain("13105550100");
    expect(where).toContain("regexp_replace");
  });

  it("clears a formatted suppression when START arrives as E.164", async () => {
    await applySmsKeyword("+13105550100", "START");
    expect(state.deletes[0]?.table).toBe(smsSuppressions);
    const where = sqlText(state.deletes[0]?.where);
    expect(where).toContain("3105550100");
    expect(where).toContain("13105550100");
    expect(state.updates[0]?.set).toEqual({ smsOptIn: true });
  });
});
