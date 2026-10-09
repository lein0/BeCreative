import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelBookingAction } from "@/lib/actions";
import { ticketAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { studentCancelPolicy } from "@/lib/booking-service";
import { describedCancelOutcome } from "@/lib/cancel-policy";
import { db } from "@/lib/db";
import { bookingSessions, bookings, classes, sessions, teachers } from "@/lib/db/schema";
import { checkoutPolicyText } from "@/lib/policy-copy";

export default function BookingHelpPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading help…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.userId, actor.id))).limit(1);
  if (!booking) notFound();
  const [klass] = await db.select().from(classes).where(eq(classes.id, booking.classId)).limit(1);
  if (!klass) notFound();
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, klass.teacherId)).limit(1);
  const links = await db.select().from(bookingSessions).where(eq(bookingSessions.bookingId, booking.id));
  const sessionRows = links.length ? await db.select().from(sessions).where(inArray(sessions.id, links.map((link) => link.sessionId))) : [];
  const now = new Date();
  const cancelPolicy = await studentCancelPolicy(klass.teacherId);
  const outcome = describedCancelOutcome({
    sessionStarts: sessionRows.map((session) => session.startsAt),
    now,
    fullRefundHours: cancelPolicy.fullRefundHours,
    creditOnlyHours: cancelPolicy.creditOnlyHours,
  });
  const policy = await checkoutPolicyText();
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="display text-5xl">Get help</h1>
      <p className="mt-2 text-ink/70">{klass.title}</p>
      <Panel>
        <p className="text-sm">{policy}</p>
        <p className="mt-2 text-sm">{outcome === "already_started" ? "This class has already started." : `Right now a cancellation would be: ${outcome === "full_refund" ? "a full refund" : outcome === "credit" ? "studio credit" : "no refund"}.`}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {booking.status === "confirmed" && outcome !== "already_started" ? (
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button className="rounded-full bg-ink px-3 py-1.5 text-paper">Cancel</button>
            </form>
          ) : null}
          <Link href={`/c/${klass.slug}`} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">Reschedule</Link>
          {teacher ? <Link href={`/t/${teacher.slug}`} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">Contact the studio</Link> : null}
        </div>
      </Panel>
      <form action={ticketAction} className="mt-6 space-y-3">
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="category" value="class" />
        <label className="block text-sm">Subject<input name="subject" required defaultValue={`Help with ${klass.title}`} className={`${control} mt-1`} /></label>
        <label className="block text-sm">What do you need?<textarea name="body" required className={`${control} mt-1 min-h-28`} /></label>
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Send a ticket</button>
      </form>
    </div>
  );
}
