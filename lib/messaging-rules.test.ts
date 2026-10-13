import { describe, expect, it } from "vitest";
import { channelAfterAttempt, chooseTextChannel, guardSms, maySend, smsKeyword, smsOnByDefault, smsWanted, teacherMarketingTextAllowed, twimlMessage, withinMonthlyCap } from "@/lib/messaging-rules";
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
    expect(maySend({ channel: "sms", consent: "marketing", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: true, smsOptIn: true, smsSuppressed: false })).toBe(false);
    expect(maySend({ channel: "sms", consent: "transactional", emailUnsubscribed: false, emailSuppressed: false, marketingOptIn: false, smsOptIn: true, smsSuppressed: false })).toBe(true);
    expect(teacherMarketingTextAllowed("marketing")).toBe(false);
    expect(teacherMarketingTextAllowed("transactional")).toBe(true);
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
});
