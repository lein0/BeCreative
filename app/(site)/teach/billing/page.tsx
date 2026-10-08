import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connectAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { syncConnectAccount } from "@/lib/stripe-connect";
import { stripeConfigured } from "@/lib/stripe";
import { billing, teacherByUser } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function BillingPage({ searchParams }: { searchParams: Promise<{ connect?: string; error?: string }> }) {
  return <Suspense fallback={null}><Body searchParams={searchParams} /></Suspense>;
}

async function Body({ searchParams }: { searchParams: Promise<{ connect?: string; error?: string }> }) {
  const query = await searchParams;
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  if (query.connect === "return" && teacher.stripeAccountId) await syncConnectAccount(teacher.stripeAccountId);
  const data = await billing(teacher.id);
  const fresh = query.connect === "return" ? (await teacherByUser(actor.id)) ?? teacher : teacher;
  return (
    <div>
      <h1 className="display text-5xl">Payouts</h1>
      {query.error ? <p className="mt-3 text-sm text-clay">{query.error}</p> : null}
      <p className="mt-2 text-sm text-ink/70">{stripeConfigured() ? "Stripe is configured." : "Payments are not configured. Online bookings complete as pay-at-studio."}</p>
      <p className="mt-4 text-lg">Owed from online card payments: {money(data.owed)}</p>
      <p className="text-sm text-ink/60">Connect account: {fresh.stripeAccountId || "not connected"}</p>
      <ul className="mt-2 text-sm text-ink/70">
        <li>Charges enabled: {fresh.stripeChargesEnabled ? "yes" : "not yet"}</li>
        <li>Payouts enabled: {fresh.stripePayoutsEnabled ? "yes" : "not yet"}</li>
        {fresh.stripeRequirementsDue ? <li>Still needed: {fresh.stripeRequirementsDue}</li> : null}
      </ul>
      {stripeConfigured() ? (
        <form action={connectAction} className="mt-4">
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">{fresh.stripeAccountId ? "Continue Stripe setup" : "Connect payouts"}</button>
        </form>
      ) : null}
      <div className="mt-4 space-y-2">
        {data.orderRows.slice(0, 12).map((order) => (
          <Panel key={order.id}>{order.status} · student {money(order.studentPaysCents)} · you {money(order.teacherAmountCents)} · {order.paymentPath}{order.ref ? ` · ref ${order.ref}` : ""}</Panel>
        ))}
      </div>
    </div>
  );
}
