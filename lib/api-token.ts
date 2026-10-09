import { createHash } from "node:crypto";

export function parseBearer(header: string | null) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenUsable(row: { expiresAt: Date; revokedAt: Date | null }, now = new Date()) {
  if (row.revokedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}
