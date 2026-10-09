import { and, eq, gte, sql } from "drizzle-orm";
import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { db } from "@/lib/db";
import { messageLog, platformSettings, smsSuppressions, user } from "@/lib/db/schema";
import { channelAfterAttempt, chooseTextChannel, guardSms, withinMonthlyCap } from "@/lib/messaging-rules";
import { canonicalPhone, phoneDigitsMatch } from "@/lib/phone";
import { SHIP_DEFAULTS } from "@/lib/ship-defaults";
import { twilioConfigured } from "@/lib/sms";

export type TextChannel = "sms" | "imessage";

type SendResult = { ok: boolean; skipped?: boolean; id?: string; error?: string };

function providerName() {
  const name = (process.env.SMS_PROVIDER || "aws").toLowerCase();
  if (name === "twilio" || name === "telnyx") return name;
  return "aws";
}

export function smsProviderConfigured() {
  const name = providerName();
  if (name === "twilio") return twilioConfigured();
  if (name === "telnyx") return Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER);
  return Boolean(process.env.AWS_REGION && process.env.AWS_SMS_ORIGINATION_IDENTITY);
}

export function imessageConfigured() {
  const name = (process.env.IMESSAGE_PROVIDER || "off").toLowerCase();
  if (name === "sendblue") return Boolean(process.env.SENDBLUE_API_KEY && process.env.SENDBLUE_API_SECRET && process.env.SENDBLUE_FROM_NUMBER);
  if (name === "loopmessage") return Boolean(process.env.LOOPMESSAGE_API_KEY && process.env.LOOPMESSAGE_SENDER);
  return false;
}

async function sendAws(to: string, body: string): Promise<SendResult> {
  const client = new PinpointSMSVoiceV2Client({ region: process.env.AWS_REGION });
  const result = await client.send(new SendTextMessageCommand({
    DestinationPhoneNumber: to,
    OriginationIdentity: process.env.AWS_SMS_ORIGINATION_IDENTITY,
    MessageBody: body,
    MessageType: "TRANSACTIONAL",
    ConfigurationSetName: process.env.AWS_SMS_CONFIGURATION_SET || undefined,
  }));
  return { ok: true, id: result.MessageId };
}

async function sendTwilio(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }),
  });
  if (!response.ok) return { ok: false, error: `Twilio ${response.status}` };
  const json = await response.json() as { sid?: string };
  return { ok: true, id: json.sid };
}

async function sendTelnyx(to: string, body: string): Promise<SendResult> {
  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.TELNYX_FROM_NUMBER, to, text: body }),
  });
  if (!response.ok) return { ok: false, error: `Telnyx ${response.status}` };
  return { ok: true };
}

async function imessageCapable(to: string) {
  const name = (process.env.IMESSAGE_PROVIDER || "off").toLowerCase();
  if (name === "sendblue") {
    const response = await fetch(`https://api.sendblue.co/api/evaluate-service?number=${encodeURIComponent(to)}`, {
      headers: { "sb-api-key-id": process.env.SENDBLUE_API_KEY!, "sb-api-secret-key": process.env.SENDBLUE_API_SECRET! },
    });
    if (!response.ok) return false;
    const json = await response.json() as { service?: string };
    return json.service === "iMessage";
  }
  if (name === "loopmessage") return true;
  return false;
}

async function sendImessage(to: string, body: string): Promise<SendResult> {
  const name = (process.env.IMESSAGE_PROVIDER || "off").toLowerCase();
  if (name === "sendblue") {
    const response = await fetch("https://api.sendblue.co/api/send-message", {
      method: "POST",
      headers: { "sb-api-key-id": process.env.SENDBLUE_API_KEY!, "sb-api-secret-key": process.env.SENDBLUE_API_SECRET!, "content-type": "application/json" },
      body: JSON.stringify({ number: to, content: body, from_number: process.env.SENDBLUE_FROM_NUMBER }),
    });
    if (!response.ok) return { ok: false, error: `Sendblue ${response.status}` };
    return { ok: true };
  }
  const response = await fetch("https://a.loopmessage.com/api/v1/message/send/", {
    method: "POST",
    headers: { authorization: process.env.LOOPMESSAGE_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ contact: to, text: body, sender: process.env.LOOPMESSAGE_SENDER }),
  });
  if (!response.ok) return { ok: false, error: `LoopMessage ${response.status}` };
  return { ok: true };
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const name = providerName();
  if (name === "twilio") return sendTwilio(to, body);
  if (name === "telnyx") return sendTelnyx(to, body);
  return sendAws(to, body);
}

export async function dispatchText(input: { to: string; body: string; userId?: string | null; imessageEnabled: boolean }) {
  const body = guardSms(input.body);
  const destination = canonicalPhone(input.to) || input.to;
  const [suppressed] = await db.select().from(smsSuppressions).where(phoneDigitsMatch(smsSuppressions.phone, destination)).limit(1);
  if (suppressed) return { ok: false as const, skipped: true as const, reason: "opt_out" };
  const [settings] = await db.select().from(platformSettings).limit(1);
  const cost = settings?.smsSegmentCostCents ?? SHIP_DEFAULTS.smsSegmentCostCents;
  const cap = settings?.smsMonthlyCapCents ?? SHIP_DEFAULTS.smsMonthlyCapCents;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [spent] = await db.select({ total: sql<number>`coalesce(sum(${messageLog.costCents}), 0)::int` }).from(messageLog).where(and(gte(messageLog.createdAt, start), eq(messageLog.status, "sent")));
  if (!withinMonthlyCap(Number(spent?.total ?? 0), cost, cap)) {
    await db.insert(messageLog).values({ id: crypto.randomUUID(), userId: input.userId, channel: "sms", provider: providerName(), toAddress: destination, body, costCents: 0, status: "capped" });
    return { ok: false as const, skipped: true as const, reason: "cap" };
  }
  const capable = input.imessageEnabled && imessageConfigured() ? await imessageCapable(destination) : false;
  const preferred = chooseTextChannel({ imessageEnabled: input.imessageEnabled && imessageConfigured(), imessageCapable: capable });
  let provider = preferred === "imessage" ? "imessage" : providerName();
  if (preferred === "sms" && !smsProviderConfigured()) return { ok: false as const, skipped: true as const, reason: "unconfigured" };
  let result = preferred === "imessage" ? await sendImessage(destination, body) : await sendSms(destination, body);
  const channel = channelAfterAttempt(preferred, result.ok, smsProviderConfigured());
  if (channel === "sms" && preferred === "imessage") {
    provider = providerName();
    result = await sendSms(destination, body);
  }
  await db.insert(messageLog).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    channel,
    provider,
    toAddress: destination,
    body,
    costCents: result.ok ? cost : 0,
    status: result.ok ? "sent" : "failed",
  });
  return { ok: result.ok, skipped: false as const, channel, error: result.error };
}

export async function sendKeywordReply(to: string, body: string) {
  const destination = canonicalPhone(to) || to.trim();
  if (!destination || !body.trim()) return { ok: false as const, skipped: true as const, reason: "empty" as const };
  if (!smsProviderConfigured()) return { ok: false as const, skipped: true as const, reason: "unconfigured" as const };
  return sendSms(destination, body);
}

export async function applySmsKeyword(phone: string, body: string) {
  const { smsKeyword } = await import("@/lib/messaging-rules");
  const keyword = smsKeyword(body);
  if (!keyword) return { keyword: null as null };
  const stored = canonicalPhone(phone) || phone;
  if (keyword === "stop") {
    await db.insert(smsSuppressions).values({ phone: stored, reason: "stop" }).onConflictDoNothing();
    await db.update(user).set({ smsOptIn: false }).where(phoneDigitsMatch(user.phone, phone));
    return { keyword, reply: "You are opted out of BeCreative texts. Reply START to opt in again. Msg & data rates may apply." };
  }
  if (keyword === "start") {
    await db.delete(smsSuppressions).where(phoneDigitsMatch(smsSuppressions.phone, phone));
    await db.update(user).set({ smsOptIn: true }).where(phoneDigitsMatch(user.phone, phone));
    return { keyword, reply: "You are opted in to BeCreative class texts. Reply STOP to opt out. Reply HELP for help." };
  }
  return { keyword, reply: "BeCreative class reminders. Reply STOP to opt out, START to opt in. Help: hello@becreative.local. Msg & data rates may apply." };
}
