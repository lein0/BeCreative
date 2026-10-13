import { describe, expect, it } from "vitest";
import { channelAfterAttempt, chooseTextChannel, composeSms, deferredSmsAllowed, guardSms, maySend, reminderJob, smsKeyword, smsOnByDefault, smsWanted, textTransportReady, twimlMessage, withinMonthlyCap } from "@/lib/messaging-rules";
import { templateFor } from "@/lib/triggers";

describe("text defaults and consent", () => {
  it("texts only the 2-hour reminder, a same-day cancellation, and a waitlist spot", () => {
    expect(smsOnByDefault("waitlist.spot_open")).toBe(true);
    expect(smsOnByDefault("booking.reminder", true)).toBe(true);
    expect(smsOnByDefault("booking.reminder", false)).toBe(false);
    expect(smsOnByDefault("booking.cancelled", true)).toBe(true);
    expect(smsOnByDefault("booking.cancelled", false)).toBe(false);
    expect(smsOnByDefault("booking.confirmed")).toBe(false);
    expect(smsOnByDefault("winback")).toBe(false);
  });

  it("keeps marketing consent separate from a transactional email", () => {
    expect(maySend({ channel: "email", consent: "transactional", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: false, smsOptIn: false, smsSuppressed: false })).toBe(true);
    expect(maySend({ channel: "email", consent: "marketing", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: false, smsOptIn: true, smsSuppressed: false })).toBe(false);
    expect(maySend({ channel: "email", consent: "marketing", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: true, smsOptIn: false, smsSuppressed: false })).toBe(true);
    expect(maySend({ channel: "email", consent: "transactional", emailUnsubscribed: false, emailSuppressed: true, marketingOptIn: true, smsOptIn: true, smsSuppressed: false })).toBe(false);
    expect(maySend({ channel: "sms", consent: "transactional", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: false, smsOptIn: false, smsSuppressed: false })).toBe(false);
    expect(maySend({ channel: "sms", consent: "transactional", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: false, smsOptIn: true, smsSuppressed: true })).toBe(false);
    expect(maySend({ channel: "email", consent: "transactional", emailUnsubscribed: true, emailSuppressed: false, marketingOptIn: false, smsOptIn: false, smsSuppressed: false, event: "booking.confirmed" })).toBe(false);
    expect(maySend({ channel: "email", consent: "transactional", emailUnsubscribed: true, emailSuppressed: false, marketingOptIn: false, smsOptIn: false, smsSuppressed: false, event: "receipt.sent" })).toBe(true);
    expect(maySend({ channel: "email", consent: "transactional", emailUnsubscribed: true, emailSuppressed: true, marketingOptIn: false, smsOptIn: false, smsSuppressed: false, event: "receipt.sent" })).toBe(false);
  });
});

describe("SMS keywords and iMessage fallback", () => {
  it("reads STOP, HELP, and START", () => {
    expect(smsKeyword("STOP")).toBe("stop");
    expect(smsKeyword("help please")).toBe("help");
    expect(smsKeyword("Start")).toBe("start");
    expect(smsKeyword("see you there")).toBeNull();
  });

  it("sends iMessage when the number can take it, and SMS otherwise", () => {
    expect(chooseTextChannel({ imessageEnabled: true, imessageCapable: true })).toBe("imessage");
    expect(chooseTextChannel({ imessageEnabled: true, imessageCapable: false })).toBe("sms");
    expect(chooseTextChannel({ imessageEnabled: false, imessageCapable: true })).toBe("sms");
    expect(channelAfterAttempt("imessage", false, true)).toBe("sms");
    expect(channelAfterAttempt("imessage", true, true)).toBe("imessage");
    expect(channelAfterAttempt("imessage", false, false)).toBe("imessage");
  });

  it("lets a saved text preference override the default, and keeps the 2-hour window", () => {
    expect(smsWanted({ event: "booking.reminder", textEligible: true, savedSms: null })).toBe(true);
    expect(smsWanted({ event: "booking.reminder", textEligible: false, savedSms: true })).toBe(false);
    expect(smsWanted({ event: "waitlist.spot_open", textEligible: false, savedSms: false })).toBe(false);
    expect(smsWanted({ event: "booking.confirmed", textEligible: false, savedSms: true })).toBe(true);
    expect(smsWanted({ event: "booking.confirmed", textEligible: false, savedSms: null })).toBe(false);
    expect(templateFor("booking.cancelled", "teacher")?.template).toBe("teacher.cancelled");
    expect(templateFor("booking.cancelled", "student")?.template).toBe("booking.cancelled");
    expect(templateFor("waitlist.joined", "teacher")?.template).toBe("teacher.waitlist");
    expect(templateFor("waitlist.joined", "student")?.template).toBe("student.waitlist");
  });

  it("returns keyword confirmation as TwiML for a form webhook", () => {
    const xml = twimlMessage("You are opted out. Reply START to opt in.");
    expect(xml).toContain("<Response><Message>");
    expect(xml).toContain("opted out");
    expect(twimlMessage(`Tom & "Jerry"`)).toContain("Tom &amp; &quot;Jerry&quot;");
  });

  it("keeps a text inside one segment and under the monthly cap", () => {
    expect(guardSms("See you at 7.")).toBe("See you at 7.");
    expect(guardSms("a".repeat(180)).length).toBe(160);
    expect(withinMonthlyCap(4999, 1, 5000)).toBe(true);
    expect(withinMonthlyCap(5000, 1, 5000)).toBe(false);
  });

  it("keeps the short link when the note is longer than one segment", () => {
    const link = "https://bcr.tv/abc";
    const text = composeSms({ title: "Scene Study", body: "a".repeat(200), link });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith(link)).toBe(true);
  });

  it("does not send a deferred text after an opt-out", () => {
    expect(deferredSmsAllowed({ triggerOn: true, event: "booking.reminder", textEligible: true, savedSms: null, smsOptIn: true })).toBe(true);
    expect(deferredSmsAllowed({ triggerOn: true, event: "booking.reminder", textEligible: true, savedSms: null, smsOptIn: false })).toBe(false);
    expect(deferredSmsAllowed({ triggerOn: true, event: "booking.reminder", textEligible: true, savedSms: false, smsOptIn: true })).toBe(false);
    expect(deferredSmsAllowed({ triggerOn: false, event: "waitlist.spot_open", textEligible: true, savedSms: null, smsOptIn: true })).toBe(false);
  });

  it("sends when only iMessage is configured, and includes the visit reminder text flag", () => {
    expect(textTransportReady({ smsProvider: false, imessageOn: true })).toBe(true);
    expect(textTransportReady({ smsProvider: false, imessageOn: false })).toBe(false);
    expect(reminderJob({ userId: "u", title: "Sauna is in 2 hours", body: "Soon", href: "/bookings", hours: 2 }).textEligible).toBe(true);
    expect(reminderJob({ userId: "u", title: "Sauna is in 24 hours", body: "Soon", href: "/bookings", hours: 24 })).toMatchObject({ event: "booking.reminder", audience: "student", textEligible: false });
  });
});
