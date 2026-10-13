import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { membershipSubscriptions, memberships } from "@/lib/db/schema";
import { updatePaymentAction } from "@/lib/renewal-actions";

export default function UpdatePaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading payment update…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireActor();
  const [row] = await db
    .select({ sub: membershipSubscriptions, plan: memberships })
    .from(membershipSubscriptions)
    .innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId))
    .where(eq(membershipSubscriptions.id, id))
    .limit(1);
  if (!row || row.sub.userId !== actor.id) notFound();
  const ended = row.sub.cancelAtPeriodEnd || row.sub.status === "cancelled";
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <p className="text-sm"><Link href="/account">Account</Link> › <Link href="/account/memberships">Memberships</Link> › Update payment</p>
      <h1 className="display mt-2 text-5xl">{row.plan.name}</h1>
      {query.error ? <p className="mt-4 text-sm text-clay">{query.error}</p> : null}
      {ended ? (
        <p className="mt-6 text-lg">This membership is already cancelled, so there is no card to update.</p>
      ) : (
        <form action={updatePaymentAction} className="mt-6 space-y-4">
          <input type="hidden" name="subscriptionId" value={row.sub.id} />
          <p className="text-lg">Update the card used for renewal. Cancelling is separate and stops future charges.</p>
          <button className="rounded-full bg-ink px-5 py-3 text-base font-semibold text-paper">Update payment</button>
          <p className="text-sm"><Link href={`/account/memberships/${row.sub.id}/cancel`} className="underline">Cancel membership</Link></p>
        </form>
      )}
    </div>
  );
}
