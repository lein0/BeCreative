import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { stripeConfigured } from "@/lib/stripe";
import { billing, teacherByUser } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function BillingPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const data = await billing(teacher.id);
  return (
    <div>
      <h1 className="display text-5xl">Billing</h1>
      <p className="mt-2 text-sm text-ink/70">{stripeConfigured() ? "Stripe is configured." : "Payments are not configured. Online bookings complete as pay-at-studio."}</p>
      <p className="mt-4 text-lg">Owed from online card payments: {money(data.owed)}</p>
      <p className="text-sm text-ink/60">Connect account: {teacher.stripeAccountId || "not connected"}</p>
      <div className="mt-4 space-y-2">
        {data.orderRows.slice(0, 12).map((order) => (
          <Panel key={order.id}>{order.status} · student {money(order.studentPaysCents)} · you {money(order.teacherAmountCents)} · {order.paymentPath}{order.ref ? ` · ref ${order.ref}` : ""}</Panel>
        ))}
      </div>
    </div>
  );
}
