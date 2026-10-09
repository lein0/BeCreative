import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email";
import { hitRateLimit } from "@/lib/rate-limit";
import { snsSubscribeUrlAllowed } from "@/lib/sns-url";

type BounceNotice = {
  notificationType?: string;
  eventType?: string;
  bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress?: string }[] };
  complaint?: { complainedRecipients?: { emailAddress?: string }[] };
  type?: string;
  email?: string;
};

export async function POST(request: Request) {
  const secret = process.env.SES_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const presented = request.headers.get("authorization")?.replace(/^Bearer /, "") || url.searchParams.get("token");
  if (!secret || presented !== secret) return new Response("Unauthorized", { status: 401 });
  const limit = await hitRateLimit("ses-webhook", 120, 60 * 1000);
  if (!limit.ok) return new Response("Too many requests", { status: 429 });
  const json = await request.json() as { Type?: string; SubscribeURL?: string; Message?: string } & BounceNotice;
  if (json.Type === "SubscriptionConfirmation" && json.SubscribeURL) {
    if (!snsSubscribeUrlAllowed(json.SubscribeURL)) return new Response("Invalid confirmation URL", { status: 400 });
    await fetch(json.SubscribeURL);
    return Response.json({ ok: true });
  }
  const notice: BounceNotice = json.Type === "Notification" && json.Message ? JSON.parse(json.Message) as BounceNotice : json;
  const kind = (notice.notificationType || notice.eventType || notice.type || "").toLowerCase();
  const emails = new Set<string>();
  const hardBounce = kind === "bounce" && (!notice.bounce || notice.bounce.bounceType === "Permanent");
  if (hardBounce) {
    if (notice.email) emails.add(notice.email.toLowerCase());
    for (const recipient of notice.bounce?.bouncedRecipients ?? []) if (recipient.emailAddress) emails.add(recipient.emailAddress.toLowerCase());
  }
  if (kind === "complaint") {
    if (notice.email) emails.add(notice.email.toLowerCase());
    for (const recipient of notice.complaint?.complainedRecipients ?? []) if (recipient.emailAddress) emails.add(recipient.emailAddress.toLowerCase());
  }
  for (const email of emails) {
    await db.update(user).set({ emailSuppressed: true }).where(sql`lower(${user.email}) = ${normalizeEmail(email)}`);
  }
  return Response.json({ ok: true, suppressed: emails.size });
}
