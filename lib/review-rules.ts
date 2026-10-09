import path from "node:path";
import { validatePromo, type PromoRule } from "@/lib/pricing";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Resolved file path inside root, or null when the key escapes the upload directory. */
export function containedMediaPath(root: string, key: string) {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  if (path.posix.isAbsolute(normalized)) return null;
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, ...parts);
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
  if (full !== rootResolved && !full.startsWith(prefix)) return null;
  return full;
}

export function studioCanSell(status: string) {
  return status === "approved";
}

export function publicListingVisible(input: { classStatus: string; teacherStatus: string }) {
  return input.classStatus === "published" && studioCanSell(input.teacherStatus);
}

export function uploadExceedsLimit(byteLength: number, limit = MAX_UPLOAD_BYTES) {
  return !Number.isFinite(byteLength) || byteLength > limit;
}

export async function readLimitedBody(request: Request, limit = MAX_UPLOAD_BYTES) {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) {
    const bytes = Buffer.from(await request.arrayBuffer());
    return uploadExceedsLimit(bytes.byteLength, limit) ? null : bytes;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (uploadExceedsLimit(total, limit)) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function paidCheckoutSendsBookingEmail(kind: string) {
  return kind === "booking" || kind === "visit";
}

/** Card checkout returns before the in-app booking events. Fulfillment emits them for classes and visits. */
export function paidCheckoutEmitsBookingNotifications(kind: string) {
  return kind === "booking" || kind === "visit";
}

export function classPromoDecision(input: {
  promo: PromoRule;
  now: Date;
  listPriceCents: number;
  totalRedemptions: number;
  customerRedemptions: number;
  isFirstTimeStudent: boolean;
  product: { kind: "class"; teacherId: string | null; classId: string; categoryId: string; city?: string };
}) {
  return validatePromo(input);
}

/** Identifier Better Auth stores and later looks up for a password reset. */
export function passwordResetIdentifier(token: string) {
  return `reset-password:${token}`;
}
