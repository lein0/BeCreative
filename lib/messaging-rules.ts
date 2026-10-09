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

export function withinMonthlyCap(spentCents: number, nextCostCents: number, capCents: number) {
  return spentCents + nextCostCents <= capCents;
}

/** Receipts and membership auto-renewal mail still go out after a marketing unsubscribe. */
export function unsubscribeBlocksEmail(event?: string) {
  if (!event) return true;
  if (event === "receipt.sent" || event.startsWith("membership.")) return false;
  return true;
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
  if (input.consent === "marketing") return false;
  return input.smsOptIn && !input.smsSuppressed;
}

/** Studio outbound texts are transactional. Marketing texts are not sent. */
export function teacherMarketingTextAllowed(consent: "transactional" | "marketing") {
  return consent === "transactional";
}

export function smsWebhookIsForm(contentType: string) {
  return contentType.toLowerCase().includes("application/x-www-form-urlencoded");
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
