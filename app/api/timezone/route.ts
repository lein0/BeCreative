import { eq } from "drizzle-orm";
import { getActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { usableTimeZone } from "@/lib/sms-window";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ ok: true, saved: false });
  let timezone = "";
  try {
    const body = await request.json() as { timezone?: string };
    timezone = usableTimeZone(body.timezone) ?? "";
  } catch {
    timezone = "";
  }
  if (!timezone) return Response.json({ ok: false }, { status: 400 });
  await db.update(user).set({ timezone }).where(eq(user.id, actor.id));
  return Response.json({ ok: true, saved: true });
}
