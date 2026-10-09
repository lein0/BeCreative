import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  account,
  bookings,
  cannedReplies,
  disputeNotes,
  disputes,
  faqArticles,
  ticketMessages,
  tickets,
  classMedia,
  classes,
  creditLedger,
  introRedemptions,
  feedback,
  feedbackDeliveries,
  feedbackEvents,
  leadActivities,
  leads,
  linkClicks,
  locations,
  memberships,
  messageLog,
  shortLinks,
  membershipSubscriptions,
  orders,
  packPurchases,
  packs,
  payouts,
  promoCodes,
  promoRedemptions,
  reviews,
  services,
  session,
  teachers,
  visitBookings,
  credentials,
  user,
  userRoles,
  waitlistEntries,
} from "@/lib/db/schema";

export async function wipeDemo() {
  const demoUsers = await db.select({ id: user.id }).from(user).where(sql`${user.isDemo} = true`);
  const userIds = demoUsers.map((row) => row.id);
  const demoBookings = await db.select({ id: bookings.id }).from(bookings).where(sql`${bookings.isDemo} = true`);
  const bookingIds = demoBookings.map((row) => row.id);
  const demoOrders = await db.select({ id: orders.id }).from(orders).where(sql`${orders.isDemo} = true`);
  const orderIds = demoOrders.map((row) => row.id);

  if (bookingIds.length) await db.delete(creditLedger).where(inArray(creditLedger.bookingId, bookingIds));
  if (userIds.length) await db.delete(creditLedger).where(inArray(creditLedger.userId, userIds));
  if (orderIds.length) await db.delete(promoRedemptions).where(inArray(promoRedemptions.orderId, orderIds));
  if (userIds.length) await db.delete(introRedemptions).where(inArray(introRedemptions.userId, userIds));
  const demoFeedback = await db.select({ id: feedback.id }).from(feedback).where(sql`${feedback.isDemo} = true`);
  const feedbackIds = demoFeedback.map((row) => row.id);
  if (feedbackIds.length) {
    await db.delete(feedbackDeliveries).where(inArray(feedbackDeliveries.feedbackId, feedbackIds));
    await db.delete(feedbackEvents).where(inArray(feedbackEvents.feedbackId, feedbackIds));
    await db.delete(feedback).where(inArray(feedback.id, feedbackIds));
  }
  await db.delete(ticketMessages).where(sql`${ticketMessages.id} like 'ticket-demo-%'`);
  await db.delete(tickets).where(sql`${tickets.isDemo} = true`);
  await db.delete(disputeNotes).where(sql`${disputeNotes.disputeId} = 'dp_demo_scene'`);
  await db.delete(disputes).where(sql`${disputes.isDemo} = true`);
  await db.delete(messageLog).where(sql`${messageLog.isDemo} = true`);
  await db.delete(shortLinks).where(eq(shortLinks.code, "demo-scene"));
  await db.delete(faqArticles).where(sql`${faqArticles.id} like 'faq-%'`);
  await db.delete(cannedReplies).where(eq(cannedReplies.id, "canned-refund-window"));
  await db.delete(waitlistEntries).where(sql`${waitlistEntries.isDemo} = true`);
  await db.delete(visitBookings).where(sql`${visitBookings.isDemo} = true`);
  if (bookingIds.length) await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
  await db.delete(packPurchases).where(sql`${packPurchases.isDemo} = true`);
  await db.delete(membershipSubscriptions).where(sql`${membershipSubscriptions.isDemo} = true`);
  await db.delete(reviews).where(sql`${reviews.isDemo} = true`);
  await db.delete(linkClicks).where(sql`${linkClicks.isDemo} = true`);
  await db.delete(classMedia).where(sql`${classMedia.isDemo} = true`);
  await db.delete(classes).where(sql`${classes.isDemo} = true`);
  await db.delete(services).where(sql`${services.isDemo} = true`);
  await db.delete(credentials).where(sql`${credentials.isDemo} = true`);
  await db.delete(packs).where(sql`${packs.isDemo} = true`);
  await db.delete(memberships).where(sql`${memberships.isDemo} = true`);
  await db.delete(promoCodes).where(sql`${promoCodes.isDemo} = true`);
  await db.delete(payouts).where(sql`${payouts.isDemo} = true`);
  await db.delete(locations).where(sql`${locations.isDemo} = true`);
  await db.delete(leadActivities).where(sql`${leadActivities.isDemo} = true`);
  await db.delete(leads).where(sql`${leads.isDemo} = true`);
  await db.delete(teachers).where(sql`${teachers.isDemo} = true`);
  if (userIds.length) {
    await db.delete(session).where(inArray(session.userId, userIds));
    await db.delete(account).where(inArray(account.userId, userIds));
    await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await db.delete(user).where(inArray(user.id, userIds));
  }
}

if (process.argv[1]?.includes("wipe-demo")) {
  wipeDemo()
    .then(() => {
      console.log("Demo data removed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
