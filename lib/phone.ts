import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** Digit forms that should compare equal across typed and E.164 numbers. */
export function phoneDigitKeys(input: string) {
  const digits = input.replace(/\D/g, "");
  if (!digits) return [];
  const keys = new Set<string>([digits]);
  if (digits.length === 11 && digits.startsWith("1")) keys.add(digits.slice(1));
  if (digits.length === 10) keys.add(`1${digits}`);
  return [...keys];
}

export function phonesMatch(left: string, right: string) {
  const keys = new Set(phoneDigitKeys(left));
  return phoneDigitKeys(right).some((key) => keys.has(key));
}

/** Provider-facing E.164. Ten-digit numbers are treated as US, matching the +1 field. */
export function canonicalPhone(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function phoneForStorage(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return canonicalPhone(trimmed) || trimmed;
}

export function phoneDigitsMatch(column: AnyColumn, phone: string): SQL {
  const keys = phoneDigitKeys(phone);
  if (!keys.length) return sql`false`;
  const list = sql.join(keys.map((key) => sql`${key}`), sql`, `);
  return sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g') in (${list})`;
}
