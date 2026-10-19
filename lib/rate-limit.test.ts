import { beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = { key: string; windowStart: Date; count: number };
type Upsert = { set: { count: unknown; windowStart: unknown }; setWhere?: unknown };

const store = vi.hoisted(() => ({
  buckets: new Map<string, Bucket>(),
  upserts: 0,
  selects: 0,
  holdReads: 0,
  readQueue: [] as Array<() => void>,
  lastUpsert: null as Upsert | null,
}));

function sqlText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { queryChunks?: unknown[]; value?: unknown; name?: string; columnType?: unknown };
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(sqlText).join("");
  if (Array.isArray(record.value) && record.value.every((item) => typeof item === "string")) return record.value.join("");
  if (typeof record.name === "string" && "columnType" in record) return record.name;
  return "";
}

function boundValues(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown; encoder?: unknown };
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) boundValues(chunk, out);
    return out;
  }
  if ("encoder" in record && "value" in record && !Array.isArray(record.value)) out.push(record.value);
  return out;
}

function keyFrom(condition: unknown) {
  const text = boundValues(condition).find((value) => typeof value === "string");
  return typeof text === "string" ? text : "";
}

vi.mock("@/lib/db", () => ({
  db: {
    select() {
      return {
        from() {
          return {
            where(condition: unknown) {
              store.selects += 1;
              const key = keyFrom(condition);
              const snapshot = () => {
                const row = store.buckets.get(key);
                return row ? [{ ...row, windowStart: new Date(row.windowStart) }] : [];
              };
              const finish = () => {
                if (store.holdReads < 1) return Promise.resolve(snapshot());
                return new Promise<Bucket[]>((resolve) => {
                  store.readQueue.push(() => resolve(snapshot()));
                  if (store.readQueue.length >= store.holdReads) {
                    const queued = store.readQueue.splice(0);
                    for (const resume of queued) resume();
                  }
                });
              };
              return {
                limit: finish,
                for() {
                  return { limit: finish };
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(value: Bucket) {
          return {
            onConflictDoUpdate(config: Upsert) {
              return {
                returning() {
                  store.upserts += 1;
                  store.lastUpsert = config;
                  const existing = store.buckets.get(value.key);
                  if (!existing) {
                    store.buckets.set(value.key, { key: value.key, windowStart: new Date(value.windowStart), count: value.count });
                    return Promise.resolve([{ count: value.count }]);
                  }
                  const params = boundValues(config.setWhere);
                  const cutoff = params.find((param) => param instanceof Date) as Date | undefined;
                  const limit = params.find((param) => typeof param === "number") as number | undefined;
                  const expired = Boolean(cutoff && existing.windowStart.getTime() < cutoff.getTime());
                  const atomic = typeof config.set.count === "object" && config.set.count !== null;
                  if (!atomic || limit === undefined || (!expired && existing.count >= limit)) {
                    if (!atomic && typeof config.set.count === "number") {
                      existing.count = config.set.count;
                      return Promise.resolve([{ count: existing.count }]);
                    }
                    return Promise.resolve([]);
                  }
                  if (expired) {
                    existing.windowStart = new Date(value.windowStart);
                    existing.count = 1;
                  } else {
                    existing.count += 1;
                  }
                  return Promise.resolve([{ count: existing.count }]);
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: { count?: number; windowStart?: Date }) {
          return {
            where(condition: unknown) {
              const row = store.buckets.get(keyFrom(condition));
              if (row && typeof value.count === "number") row.count = value.count;
              if (row && value.windowStart instanceof Date) row.windowStart = value.windowStart;
              return Promise.resolve();
            },
          };
        },
      };
    },
  },
}));

const { hitRateLimit } = await import("@/lib/rate-limit");

describe("hitRateLimit", () => {
  beforeEach(() => {
    store.buckets.clear();
    store.upserts = 0;
    store.selects = 0;
    store.holdReads = 0;
    store.readQueue = [];
    store.lastUpsert = null;
  });

  it("stops at the cap and does not count a denied request", async () => {
    for (let i = 0; i < 3; i += 1) expect((await hitRateLimit("book:a", 3, 60_000)).ok).toBe(true);
    expect((await hitRateLimit("book:a", 3, 60_000)).ok).toBe(false);
    expect(store.buckets.get("book:a")?.count).toBe(3);
    expect((await hitRateLimit("book:b", 3, 60_000)).ok).toBe(true);
  });

  it("keeps the cap when the same key is hit in parallel", async () => {
    store.holdReads = 12;
    const results = await Promise.all(Array.from({ length: 12 }, () => hitRateLimit("refund:a", 5, 60 * 60 * 1000)));
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(results.filter((result) => !result.ok)).toHaveLength(7);
    expect(store.buckets.get("refund:a")?.count).toBe(5);
    expect(store.selects).toBe(0);
    expect(sqlText(store.lastUpsert?.set.count)).toContain("count + 1");
    expect(boundValues(store.lastUpsert?.setWhere)).toContain(5);
  });

  it("starts a fresh window after the hour passes", async () => {
    store.buckets.set("support:a", { key: "support:a", windowStart: new Date(Date.now() - 2 * 60 * 60 * 1000), count: 10 });
    expect((await hitRateLimit("support:a", 10, 60 * 60 * 1000)).ok).toBe(true);
    expect(store.buckets.get("support:a")?.count).toBe(1);
  });
});
