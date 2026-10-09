import { getActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { uploadTokens } from "@/lib/db/schema";
import { localStorage, safeKey, storageProvider } from "@/lib/storage";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { filename?: string; contentType?: string; classId?: string; teacherId?: string };
  const key = safeKey(body.filename || "upload");
  const contentType = body.contentType || "application/octet-stream";
  const token = crypto.randomUUID();
  await db.insert(uploadTokens).values({
    token,
    key,
    contentType,
    userId: actor.id,
    classId: body.classId,
    teacherId: body.teacherId,
    purpose: "media",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  if (process.env.STORAGE_PROVIDER === "s3") {
    const grant = await storageProvider().createUpload({ key, contentType });
    return Response.json(grant);
  }
  return Response.json(await localStorage.createUpload({ key, contentType, token }));
}
