import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { buildRawEmail } from "@/lib/email-mime";

export type EmailMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  teacherId?: string | null;
  headers?: Record<string, string>;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function sameInbox(stored: string, reported: string) {
  return normalizeEmail(stored) === normalizeEmail(reported);
}

export function individualDeliveries(recipients: string[]) {
  const seen = new Set<string>();
  const deliveries: string[] = [];
  for (const raw of recipients) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    deliveries.push(email);
  }
  return deliveries;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ providerMessageId: string | null }>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage) {
    const id = `console_${crypto.randomUUID()}`;
    const extra = message.headers ? `\nheaders: ${JSON.stringify(message.headers)}` : "";
    console.log(`\n[email:${id}] to=${message.to.join(", ")}\nsubject: ${message.subject}${extra}\n${message.text}\n`);
    return { providerMessageId: id };
  }
}

class SesEmailProvider implements EmailProvider {
  readonly name = "ses";
  async send(message: EmailMessage) {
    const region = process.env.AWS_REGION;
    const from = process.env.SES_FROM_EMAIL;
    if (!region || !from) throw new Error("SES is not configured. Set AWS_REGION and SES_FROM_EMAIL.");
    const { SESClient, SendRawEmailCommand } = await import("@aws-sdk/client-ses");
    // No static keys: the default credential chain uses the App Runner instance role.
    const client = new SESClient({ region });
    const raw = buildRawEmail(message, from, process.env.SES_CONFIGURATION_SET || undefined);
    const result = await client.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw) } }));
    return { providerMessageId: result.MessageId ?? null };
  }
}

export function getEmailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "ses" ? new SesEmailProvider() : new ConsoleEmailProvider();
}

export async function sendIndividually(input: Omit<EmailMessage, "to"> & { recipients: string[] }) {
  const deliveries = individualDeliveries(input.recipients);
  const results = [];
  for (const recipient of deliveries) {
    results.push(await sendEmail({ to: [recipient], subject: input.subject, text: input.text, html: input.html, teacherId: input.teacherId }));
  }
  return { count: deliveries.length, results };
}

export async function sendEmail(message: EmailMessage) {
  const provider = getEmailProvider();
  const id = crypto.randomUUID();
  try {
    const result = await provider.send(message);
    await db.insert(emailOutbox).values({
      id,
      toAddresses: message.to,
      subject: message.subject,
      textBody: message.text,
      htmlBody: message.html,
      provider: provider.name,
      status: provider.name === "console" ? "logged" : "sent",
      teacherId: message.teacherId,
      error: result.providerMessageId,
    });
    return { id, ok: true as const };
  } catch (error) {
    const text = error instanceof Error ? error.message : "Email failed";
    await db.insert(emailOutbox).values({
      id,
      toAddresses: message.to,
      subject: message.subject,
      textBody: message.text,
      htmlBody: message.html,
      provider: provider.name,
      status: "failed",
      error: text,
      teacherId: message.teacherId,
    });
    return { id, ok: false as const, error: text };
  }
}
