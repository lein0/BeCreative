export const LEGAL_PAGES = [
  { slug: "terms", title: "Terms of Use" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "refunds", title: "Refund & Cancellation Policy" },
  { slug: "teacher-agreement", title: "Teacher Agreement" },
  { slug: "waiver", title: "Waiver template" },
  { slug: "sms", title: "SMS terms" },
] as const;

export function legalBody(slug: string) {
  const common = "DRAFT FOR LAWYER REVIEW. This page is a template, not legal advice, and it is not in force until counsel approves it.";
  if (slug === "terms") return `${common}\n\nBeCreative is a marketplace where independent teachers sell classes and visits. Students book directly with a studio. The platform charges the fee shown at checkout. Accounts must be used by the person who created them.`;
  if (slug === "privacy") return `${common}\n\nWe store the account, booking, payment, message, and notification data needed to run a class. We do not ask for health or medical information. You can export or delete your account from Privacy. Card numbers stay at Stripe. A Global Privacy Control signal turns analytics and marketing cookies off, including after an earlier accept. Session replay is off.`;
  if (slug === "refunds") return `${common}\n\nDefault student policy: full refund until 24 hours before the start, studio credit only until 2 hours before, then no refund. Late-cancel and no-show fees are off unless a studio turns them on and shows them at checkout. A teacher cancellation refunds the original payment method unless the student opted into studio credit.`;
  if (slug === "teacher-agreement") return `${common}\n\nTeachers are independent. They set their classes, prices, and any tighter cancellation window. Card payouts require Stripe Express. The teacher bears a disputed charge on their own sales. During beta the platform absorbs the dispute fee unless an admin overrides that.`;
  if (slug === "sms") return `${common}\n\nTexts are optional. A person opts in with an unchecked-by-default box at signup or checkout, or by texting START. Message frequency varies: by default only a reminder two hours before class, a same-day cancellation, and a waitlist spot. Texts, including reminders, go out only between 8:00 a.m. and 8:00 p.m. in the recipient's local time, or the class time zone if we do not have theirs. A text outside that window waits until 8:00 a.m. Reply STOP to opt out and HELP for help. Message and data rates may apply. Consent to texts is separate from consent to marketing email.`;
  return `${common}\n\nThis waiver is a starting point for a studio. It is not medical care and it does not collect health information. A student signs once per studio version, with their name, the time, and their IP.`;
}
