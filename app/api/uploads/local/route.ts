import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadTokens } from "@/lib/db/schema";
import { readLimitedBody } from "@/lib/review-rules";
import { writeLocalObject } from "@/lib/storage";

export async function PUT(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });
  const [row] = await db.select().from(uploadTokens).where(eq(uploadTokens.token, token)).limit(1);
  if (!row || row.used || row.expiresAt < new Date()) return new Response("Upload expired", { status: 403 });
  const bytes = await readLimitedBody(request);
  if (!bytes) return new Response("Upload is larger than 12 MB.", { status: 413 });
  await writeLocalObject(row.key, bytes);
  await db.update(uploadTokens).set({ used: true }).where(eq(uploadTokens.token, token));
  return new Response("ok");
}
