import { getTableName, type Table } from "drizzle-orm";

type Row = Record<string, unknown>;

const state = {
  tables: new Map<string, Row[]>(),
  updates: [] as { table: string; value: Row }[],
  deletes: [] as string[],
  inserts: [] as { table: string; value: Row }[],
};

export function resetFakeDb() {
  state.tables.clear();
  state.updates.length = 0;
  state.deletes.length = 0;
  state.inserts.length = 0;
}

export function seedTable(table: Table, rows: Row[]) {
  state.tables.set(getTableName(table), rows.map((row) => ({ ...row })));
}

export function readTable(table: Table) {
  return state.tables.get(getTableName(table)) ?? [];
}

export function fakeWrites() {
  return state;
}

function sqlParams(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown; encoder?: unknown };
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) sqlParams(chunk, out);
    return out;
  }
  if ("encoder" in record && "value" in record) out.push(record.value);
  return out;
}

function sqlText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(sqlText).join("");
  if (Array.isArray(record.value) && record.value.every((item) => typeof item === "string")) return record.value.join("");
  return "";
}

function valueInRow(row: Row, param: unknown): boolean {
  if (Array.isArray(param)) return param.every((item) => valueInRow(row, item));
  for (const cell of Object.values(row)) {
    if (cell === param) return true;
    if (cell instanceof Date && param instanceof Date && cell.getTime() === param.getTime()) return true;
    if (Array.isArray(cell) && cell.includes(param)) return true;
  }
  return false;
}

export function filterRows(rows: Row[], condition: unknown) {
  const params = sqlParams(condition);
  if (!params.length) return rows;
  const inclusive = sqlText(condition).includes(" in ");
  return rows.filter((row) => (inclusive ? params.some((param) => valueInRow(row, param)) : params.every((param) => valueInRow(row, param))));
}

function chain(rows: Row[]) {
  let matched = rows;
  const api = {
    where(condition?: unknown) {
      matched = condition ? filterRows(rows, condition) : rows;
      return api;
    },
    limit(count?: number) {
      return Promise.resolve(typeof count === "number" ? matched.slice(0, count) : matched);
    },
    innerJoin() {
      return api;
    },
    orderBy() {
      return api;
    },
    then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(matched).then(resolve, reject);
    },
  };
  return api;
}

export function createFakeDb() {
  const api = {
    select() {
      return {
        from(table: Table) {
          return chain([...(state.tables.get(getTableName(table)) ?? [])]);
        },
      };
    },
    update(table: Table) {
      return {
        set(value: Row) {
          return {
            where(condition?: unknown) {
              const name = getTableName(table);
              const all = state.tables.get(name) ?? [];
              const matched = condition ? filterRows(all, condition) : all;
              for (const row of matched) Object.assign(row, value);
              state.updates.push({ table: name, value });
              const pending = Promise.resolve();
              return Object.assign(pending, {
                returning() {
                  return Promise.resolve(matched.map((row) => ({ ...row })));
                },
              });
            },
          };
        },
      };
    },
    insert(table: Table) {
      return {
        values(value: Row | Row[]) {
          const name = getTableName(table);
          const rows = Array.isArray(value) ? value : [value];
          const list = state.tables.get(name) ?? [];
          list.push(...rows);
          state.tables.set(name, list);
          for (const row of rows) state.inserts.push({ table: name, value: row });
          const pending = Promise.resolve();
          return Object.assign(pending, {
            onConflictDoNothing() {
              return pending;
            },
            returning() {
              return Promise.resolve(rows);
            },
          });
        },
      };
    },
    delete(table: Table) {
      return {
        async where(condition?: unknown) {
          const name = getTableName(table);
          const all = state.tables.get(name) ?? [];
          const matched = new Set(condition ? filterRows(all, condition) : all);
          state.tables.set(name, all.filter((row) => !matched.has(row)));
          state.deletes.push(name);
        },
      };
    },
    execute() {
      return Promise.resolve({ rows: [] });
    },
  };
  return Object.assign(api, {
    async transaction<T>(run: (tx: typeof api) => Promise<T>) {
      const snapshot = new Map<string, Row[]>();
      for (const [name, rows] of state.tables) snapshot.set(name, rows.map((row) => ({ ...row })));
      try {
        return await run(api);
      } catch (error) {
        state.tables.clear();
        for (const [name, rows] of snapshot) state.tables.set(name, rows);
        throw error;
      }
    },
  });
}
