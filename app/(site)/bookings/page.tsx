import { Suspense } from "react";
import { cancelBookingAction, cancelVisitAction } from "@/lib/actions";
import { Money, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { myBookings } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";

export default function BookingsPage({ searchParams }: { searchParams: Promise<{ waitlisted?: string; reserved?: string; error?: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading bookings…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ waitlisted?: string; reserved?: string; error?: string }> }) {
  const query = await searchParams;
  const actor = await requireActor();
  const data = await myBookings(actor.id);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">My bookings</h1>
      {query.waitlisted === "1" ? (
        <p className="mt-4 rounded-2xl border border-clay/30 bg-clay/10 px-4 py-3 text-sm">You are on the waitlist. You do not have a reserved seat yet. We will email you if a spot opens.</p>
      ) : null}
      {query.reserved === "1" ? (
        <p className="mt-4 rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm">Your seat is reserved.</p>
      ) : null}
      {query.error ? <p className="mt-4 rounded-2xl bg-sand px-4 py-3 text-sm">{query.error}</p> : null}
      <div className="mt-6 space-y-3">
        {data.rows.map((row) => (
          <Panel key={row.booking.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="display text-2xl">{row.klass.title}</p>
                <p className="text-sm text-ink/60">{row.booking.status} · {row.booking.kind}{row.order ? ` · paid ${row.order.status}` : ""}</p>
                <a href={`/c/${row.klass.slug}`} className="mt-1 inline-block text-sm text-clay">Reschedule to another date</a>
              </div>
              {row.booking.status === "confirmed" ? (
                <form action={cancelBookingAction}>
                  <input type="hidden" name="bookingId" value={row.booking.id} />
                  <button className="text-sm text-clay">Cancel</button>
                </form>
              ) : null}
            </div>
          </Panel>
        ))}
        {data.visits.map((row) => (
          <Panel key={row.visit.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="display text-2xl">{row.service.title}</p>
                <p className="text-sm text-ink/60">{row.visit.status} · {formatDateTimeInZone(row.visit.startsAt)}{row.order ? ` · ${row.order.status}` : ""}</p>
              </div>
              {row.visit.status === "confirmed" ? (
                <form action={cancelVisitAction}>
                  <input type="hidden" name="visitId" value={row.visit.id} />
                  <button className="text-sm text-clay">Cancel</button>
                </form>
              ) : null}
            </div>
          </Panel>
        ))}
        {!data.rows.length && !data.visits.length ? <p className="text-ink/60">No bookings yet.</p> : null}
      </div>
      <h2 className="display mt-10 text-3xl">Wallet</h2>
      <div className="mt-3 grid gap-3">
        {data.packsOwned.map((item) => (
          <Panel key={item.purchase.id}>{item.pack.name} · {item.purchase.creditsRemaining} of {item.purchase.creditsTotal} credits left{item.purchase.expiresAt ? ` · expires ${item.purchase.expiresAt.toLocaleDateString()}` : ""}</Panel>
        ))}
        {data.subs.map((item) => (
          <Panel key={item.sub.id}>{item.plan.name} · {item.sub.status}{item.sub.unlimited ? " · unlimited" : ` · ${item.sub.classesUsedThisPeriod} used`}</Panel>
        ))}
        {data.ledger.map((entry) => (
          <p key={entry.id} className="text-sm text-ink/60">{entry.direction} {entry.sourceType}</p>
        ))}
      </div>
      {data.rows[0]?.order ? <p className="mt-4 text-sm">Latest order total <Money cents={data.rows[0].order?.studentPaysCents ?? 0} /></p> : null}
    </div>
  );
}
