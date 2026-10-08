import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import type { BrandId } from "@/lib/brand";
import { TRIGGERS } from "@/lib/triggers";

export type EmailProps = {
  name?: string;
  title?: string;
  body?: string;
  href?: string;
  detail?: string;
  brandName?: string;
};

const palette = {
  becreative: { paper: "#f6f1e8", ink: "#1c1714", accent: "#e15a1c", sand: "#efe6da", name: "BeCreative" },
  bewell: { paper: "#f3f7f4", ink: "#17241f", accent: "#2f6b5a", sand: "#e4eee8", name: "BeWell" },
};

function copy(template: string, props: EmailProps, brandName: string) {
  const name = props.name || "there";
  const title = props.title || "your class";
  const lines: Record<string, { subject: string; preheader: string; paragraphs: string[]; cta?: string }> = {
    "auth.verify": { subject: `Confirm your ${brandName} email`, preheader: "One tap finishes your account.", paragraphs: [`Hi ${name}, confirm this address so booking receipts can reach you.`], cta: "Confirm email" },
    "auth.reset": { subject: `Reset your ${brandName} password`, preheader: "This link expires soon.", paragraphs: [`Hi ${name}, use the button to choose a new password.`], cta: "Reset password" },
    "auth.invite": { subject: `You're invited to ${brandName}`, preheader: "Set a password and open your studio.", paragraphs: [`Hi ${name}, an invite is waiting. The link sets your password.`], cta: "Accept invite" },
    "student.welcome": { subject: `Welcome to ${brandName}`, preheader: "Your account is ready.", paragraphs: [`Hi ${name}, you can book a class whenever you like. Confirm your email if you have not already.`], cta: "Explore classes" },
    "booking.confirmed": { subject: `You're booked: ${title}`, preheader: "Your seat is reserved.", paragraphs: [`Hi ${name}, ${title} is on your calendar.`, props.body || "We will remind you the day before and again two hours out."], cta: "View booking" },
    "booking.reminder": { subject: `Reminder: ${title}`, preheader: "Class is coming up.", paragraphs: [`Hi ${name}, ${title} is soon.`, props.body || ""], cta: "See details" },
    "booking.cancelled": { subject: `${title} was cancelled`, preheader: "Here is what happens to your payment.", paragraphs: [`Hi ${name}, ${title} is cancelled.`, props.body || "A refund goes back to the original payment method unless you opted into studio credit."], cta: "Reschedule" },
    "booking.refunded": { subject: `Refund for ${title}`, preheader: "The refund is on its way.", paragraphs: [`Hi ${name}, a refund for ${title} is going back to the card you used.`], cta: "View bookings" },
    "waitlist.spot_open": { subject: `A spot opened for ${title}`, preheader: "Claim it before the window closes.", paragraphs: [`Hi ${name}, a seat opened. Claim it within the window in the note.`], cta: "Claim the seat" },
    "class.changed": { subject: `${title} moved`, preheader: "The time or place changed.", paragraphs: [`Hi ${name}, ${title} changed.`, props.body || ""], cta: "See the new time" },
    "receipt.sent": { subject: `Receipt for ${title}`, preheader: "Amount and cancellation policy.", paragraphs: [`Hi ${name}, this confirms ${title}.`, props.body || "The cancellation policy you accepted is part of this receipt."], cta: "Open receipt" },
    "membership.renewal": { subject: "Your membership renews soon", preheader: "No action if the card on file is current.", paragraphs: [`Hi ${name}, ${title} renews in a few days.`], cta: "Review membership" },
    "membership.payment_failed": { subject: "We could not renew your membership", preheader: "Update the card to keep the pass.", paragraphs: [`Hi ${name}, the renewal for ${title} did not go through.`], cta: "Update payment" },
    "review.ask": { subject: `How was ${title}?`, preheader: "A sentence helps the next student.", paragraphs: [`Hi ${name}, if you have a moment, tell the next student what ${title} was like.`], cta: "Leave a note" },
    "winback": { subject: `It has been a minute, ${name}`, preheader: "Only because you asked for notes like this.", paragraphs: [`Hi ${name}, it has been about 30 days since a class. Here is what is coming up.`], cta: "See classes" },
    "teacher.booking": { subject: `New booking: ${title}`, preheader: "Someone took a seat.", paragraphs: [props.body || `${name} booked ${title}.`], cta: "Open roster" },
    "teacher.cancelled": { subject: `Cancelled: ${title}`, preheader: "Students were told and refunds follow the policy.", paragraphs: [props.body || `${title} was cancelled.`], cta: "View the date" },
    "teacher.follow": { subject: `${name} followed your studio`, preheader: "A new student wants to hear about classes.", paragraphs: [props.body || `${name} followed you.`], cta: "View profile" },
    "teacher.waitlist": { subject: `Waitlist: ${title}`, preheader: "Someone is hoping for a seat.", paragraphs: [props.body || `${name} joined the waitlist.`], cta: "View class" },
    "teacher.promoted": { subject: `Waitlist seat filled: ${title}`, preheader: "We moved the next student in.", paragraphs: [props.body || "A waitlisted student took the open seat."], cta: "View roster" },
    "teacher.offer": { subject: `Purchase: ${title}`, preheader: "A pack or membership sold.", paragraphs: [props.body || `Someone bought ${title}.`], cta: "View payouts" },
    "teacher.payout": { subject: "A payout was sent", preheader: "Stripe is moving the funds.", paragraphs: [props.body || "A payout left for your studio."], cta: "View payouts" },
    "teacher.dispute": { subject: "A card dispute was opened", preheader: "You can add notes.", paragraphs: [props.body || "A student disputed a charge. Add what you remember from Disputes."], cta: "Open dispute" },
    "teacher.ticket": { subject: `Student question: ${title}`, preheader: "Reply within a day.", paragraphs: [props.body || "A student opened a ticket."], cta: "Reply" },
    "teacher.review": { subject: `New review of ${title}`, preheader: "A student left a note.", paragraphs: [props.body || "A new review is on your studio."], cta: "Read it" },
    "teacher.approved": { subject: "Your studio is approved", preheader: "Classes can go live.", paragraphs: [`Hi ${name}, ${brandName} approved your studio. Finish Stripe if you want card checkout.`], cta: "Open studio" },
    "teacher.stripe_incomplete": { subject: "Finish payout setup", preheader: "Card checkout stays closed until Stripe enables charges.", paragraphs: ["Stripe still needs a few details. Students can pay at the studio until charges are enabled."], cta: "Continue Stripe" },
    "teacher.first_booking": { subject: "Your first booking", preheader: "Someone trusted you with a seat.", paragraphs: [`Hi ${name}, ${title} just got its first booking. That is the whole point of the studio.`], cta: "See the roster" },
    "teacher.weekly_summary": { subject: "Your week on the studio", preheader: "Bookings, revenue, and the links that worked.", paragraphs: [props.detail || props.body || "Here is the week: bookings, revenue, and your top share links."], cta: "Open reports" },
    "ticket.updated": { subject: `Reply: ${title}`, preheader: "There is a new note on your ticket.", paragraphs: [props.body || "There is a reply waiting."], cta: "Read the reply" },
  };
  return lines[template] ?? { subject: props.title || brandName, preheader: brandName, paragraphs: [props.body || ""], cta: "Open" };
}

export function emailCopy(template: string, props: EmailProps, brand: BrandId = "becreative") {
  const colors = palette[brand];
  const message = copy(template, { ...props, brandName: colors.name }, colors.name);
  return {
    subject: message.subject,
    preheader: message.preheader,
    text: [...message.paragraphs, message.cta && props.href ? `${message.cta}: ${props.href}` : ""].filter(Boolean).join("\n\n"),
    cta: message.cta,
    paragraphs: message.paragraphs,
    colors,
  };
}

function Shell({ template, props, brand }: { template: string; props: EmailProps; brand: BrandId }) {
  const message = emailCopy(template, props, brand);
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{message.preheader}</Preview>
      <Body style={{ backgroundColor: message.colors.paper, margin: 0, padding: "24px 12px", fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <Container style={{ maxWidth: "560px", backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px 24px" }}>
          <Text style={{ color: message.colors.accent, fontSize: "13px", letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 8px" }}>{message.colors.name}</Text>
          <Text style={{ color: message.colors.ink, fontSize: "28px", lineHeight: "1.2", margin: "0 0 16px" }}>{message.subject}</Text>
          {message.paragraphs.filter(Boolean).map((paragraph) => (
            <Text key={paragraph} style={{ color: message.colors.ink, fontSize: "16px", lineHeight: "1.5", margin: "0 0 12px" }}>{paragraph}</Text>
          ))}
          {message.cta && props.href ? (
            <Section style={{ margin: "20px 0" }}>
              <Button href={props.href} style={{ backgroundColor: message.colors.accent, color: "#ffffff", borderRadius: "999px", padding: "12px 18px", fontSize: "15px", textDecoration: "none" }}>{message.cta}</Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: message.colors.sand, margin: "20px 0" }} />
          <Text style={{ color: "#5c564f", fontSize: "12px", lineHeight: "1.5", margin: 0 }}>
            {message.colors.name}, Los Angeles. This note is about your account or a class you booked.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderEmail(template: string, props: EmailProps, brand: BrandId = "becreative") {
  const message = emailCopy(template, props, brand);
  const html = await render(<Shell template={template} props={props} brand={brand} />);
  return { subject: message.subject, text: message.text, html };
}

export function templateIds() {
  return [...new Set(TRIGGERS.map((trigger) => trigger.template))];
}
