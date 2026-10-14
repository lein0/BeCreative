/** Texts go out only for these moments unless a person turns a channel on themselves. */
export function smsOnByDefault(event: string, textEligible = false) {
  if (event === "waitlist.spot_open") return true;
  if (event === "booking.reminder" && textEligible) return true;
  if (event === "booking.cancelled" && textEligible) return true;
  return false;
}

export function smsKeyword(body: string) {
  const word = body.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (["stop", "stopall", "unsubscribe", "cancel", "end", "quit"].includes(word)) return "stop" as const;
  if (["help", "info"].includes(word)) return "help" as const;
  if (["start", "unstop", "yes"].includes(word)) return "start" as const;
  return null;
}

export function chooseTextChannel(input: { imessageEnabled: boolean; imessageCapable: boolean }) {
  if (input.imessageEnabled && input.imessageCapable) return "imessage" as const;
  return "sms" as const;
}

/** A failed iMessage send falls back to SMS when that provider is configured. */
export function channelAfterAttempt(preferred: "imessage" | "sms", imessageOk: boolean, smsConfigured: boolean) {
  if (preferred === "imessage" && !imessageOk && smsConfigured) return "sms" as const;
  return preferred;
}

/** A saved SMS preference wins. Reminder and cancellation texts still require the short window. */
export function smsWanted(input: { event: string; textEligible: boolean; savedSms: boolean | null }) {
  if ((input.event === "booking.reminder" || input.event === "booking.cancelled") && !input.textEligible) return false;
  if (input.savedSms === false) return false;
  if (input.savedSms === true) return true;
  return smsOnByDefault(input.event, input.textEligible);
}

export function sameLocalDay(a: Date, b: Date, timeZone = "America/Los_Angeles") {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return format.format(a) === format.format(b);
}

export function guardSms(body: string, limit = 160) {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1))}…`;
}

/** Keep the short link when the note is longer than one segment. */
export function composeSms(input: { title: string; body: string; link?: string; limit?: number }) {
  const limit = input.limit ?? 160;
  const link = (input.link ?? "").trim();
  const tail = link ? ` ${link}` : "";
  const head = `${input.title}. ${input.body}`.replace(/\s+/g, " ").trim();
  if (!tail) return guardSms(head, limit);
  if (tail.length >= limit) return guardSms(`${head}${tail}`, limit);
  const room = limit - tail.length;
  const clipped = head.length <= room ? head : `${head.slice(0, Math.max(0, room - 1))}…`;
  return `${clipped}${tail}`.trim();
}

/** A text deferred for quiet hours must pass the same opt-out checks as one sent immediately. */
export function deferredSmsAllowed(input: { triggerOn: boolean; event: string; textEligible: boolean; savedSms: boolean | null; smsOptIn: boolean }) {
  if (!input.triggerOn) return false;
  if (!smsWanted({ event: input.event, textEligible: input.textEligible, savedSms: input.savedSms })) return false;
  return maySend({
    channel: "sms",
    consent: "transactional",
    emailUnsubscribed: false,
    emailSuppressed: false,
    marketingOptIn: false,
    smsOptIn: input.smsOptIn,
    smsSuppressed: false,
  });
}

export function textTransportReady(input: { smsProvider: boolean; imessageOn: boolean }) {
  return input.smsProvider || input.imessageOn;
}

export function reminderJob(input: { userId: string; title: string; body: string; href: string; hours: number }) {
  return {
    userId: input.userId,
    event: "booking.reminder" as const,
    audience: "student" as const,
    title: input.title,
    body: input.body,
    href: input.href,
    textEligible: input.hours === 2,
  };
}

export function withinMonthlyCap(spentCents: number, nextCostCents: number, capCents: number) {
  return spentCents + nextCostCents <= capCents;
}

/** A paid-class receipt still goes out after unsubscribe. Other email does not. */
export function unsubscribeBlocksEmail(event?: string) {
  return event !== "receipt.sent";
}

export function maySend(input: {
  channel: "email" | "sms";
  consent: "transactional" | "marketing";
  emailUnsubscribed: boolean;
  emailSuppressed: boolean;
  marketingOptIn: boolean;
  smsOptIn: boolean;
  smsSuppressed: boolean;
  event?: string;
}) {
  if (input.consent === "marketing" && !input.marketingOptIn) return false;
  if (input.channel === "email") {
    if (input.emailSuppressed) return false;
    if (input.emailUnsubscribed && unsubscribeBlocksEmail(input.event)) return false;
    return true;
  }
  return input.smsOptIn && !input.smsSuppressed;
}

export function smsWebhookIsForm(contentType: string) {
  return contentType.toLowerCase().includes("application/x-www-form-urlencoded");
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textField(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value : "";
}

function phoneField(value: unknown) {
  if (typeof value === "string") return value;
  return textField(record(value), "phone_number");
}

function unwrapInbound(json: unknown) {
  const root = record(json);
  if (!root) return null;
  if (root.Type === "Notification" && typeof root.Message === "string") {
    try {
      return record(JSON.parse(root.Message)) ?? root;
    } catch {
      return root;
    }
  }
  return root;
}

/** Twilio form fields are read separately. JSON covers AWS Pinpoint and Telnyx `data.payload`. */
export function inboundSmsFields(json: unknown) {
  const message = unwrapInbound(json);
  const data = record(message?.data);
  const payload = record(data?.payload) ?? record(message?.payload);
  return {
    phone: textField(message, "originationNumber") || textField(message, "From") || textField(message, "phone") || phoneField(payload?.from),
    body: textField(message, "messageBody") || textField(message, "Body") || textField(message, "body") || textField(payload, "text"),
  };
}

export function twimlMessage(body: string) {
  const text = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`;
}
