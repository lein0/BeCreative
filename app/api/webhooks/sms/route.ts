import { applySmsKeyword, sendKeywordReply } from "@/lib/messaging";
import { smsWebhookIsForm, twimlMessage } from "@/lib/messaging-rules";
import { hitRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const presented = request.headers.get("authorization")?.replace(/^Bearer /, "") || url.searchParams.get("token");
  if (!secret || presented !== secret) return new Response("Unauthorized", { status: 401 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sms";
  const limit = await hitRateLimit(`sms:${ip}`, 60, 60 * 1000);
  if (!limit.ok) return new Response("Too many requests", { status: 429 });
  const raw = await request.text();
  const contentType = request.headers.get("content-type") || "";
  let phone = "";
  let body = "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    phone = params.get("From") || params.get("from") || "";
    body = params.get("Body") || params.get("body") || "";
  } else {
    const json = JSON.parse(raw) as { Type?: string; SubscribeURL?: string; Message?: string; phone?: string; body?: string; From?: string; Body?: string; originationNumber?: string; messageBody?: string };
    if (json.Type === "SubscriptionConfirmation" && json.SubscribeURL) {
      await fetch(json.SubscribeURL);
      return Response.json({ ok: true });
    }
    const message = json.Type === "Notification" && json.Message ? JSON.parse(json.Message) as typeof json : json;
    phone = message.originationNumber || message.From || message.phone || "";
    body = message.messageBody || message.Body || message.body || "";
  }
  if (!phone) return Response.json({ ok: false }, { status: 400 });
  const result = await applySmsKeyword(phone, body);
  if (result.reply && smsWebhookIsForm(contentType)) {
    return new Response(twimlMessage(result.reply), { headers: { "content-type": "text/xml; charset=utf-8" } });
  }
  if (result.reply) await sendKeywordReply(phone, result.reply);
  return Response.json({ ok: true, ...result });
}
