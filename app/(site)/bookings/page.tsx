import { Suspense } from "react";
import { cancelBookingAction } from "@/lib/actions";
import { Money, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { myBookings } from "@/lib/queries";

export default function BookingsPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading bookings…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const data = await myBookings(actor.id);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">My bookings</h1>
      <div className="mt-6 space-y-3">
        {data.rows.map((row) => (
          <Panel key={row.booking.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="display text-2xl">{row.klass.title}</p>
                <p className="text-sm text-ink/60">{row.booking.status} · {row.booking.kind}{row.order ? ` · paid ${row.order.status}` : ""}</p>
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
        {!data.rows.length ? <p className="text-ink/60">No bookings yet.</p> : null}
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
