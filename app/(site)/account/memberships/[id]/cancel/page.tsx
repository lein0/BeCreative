import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { confirmCancelAction } from "@/lib/renewal-actions";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { membershipSubscriptions, memberships } from "@/lib/db/schema";
import { cancellationScreen, confirmationSummary, legalIdentity } from "@/lib/renewal-copy";
import { activeTemplates, renewalSaveOfferEnabled } from "@/lib/renewal";

export default function CancelMembershipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading cancellation…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
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
  const templates = await activeTemplates();
  const legal = legalIdentity();
  const summary = confirmationSummary(row.sub.currentPeriodEnd, templates, legal);
  const screen = cancellationScreen(row.plan.name, row.sub.currentPeriodEnd, templates, legal);
  const done = query.done === "1" || row.sub.cancelAtPeriodEnd;
  const saveOffer = await renewalSaveOfferEnabled();
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <p className="text-sm"><Link href="/account">Account</Link> › <Link href="/account/memberships">Memberships</Link> › Cancel membership</p>
      <h1 className="display mt-2 text-5xl">{row.plan.name}</h1>
      {query.error ? <p className="mt-4 text-sm text-clay">{query.error}</p> : null}
      {done ? (
        <p className="mt-6 text-lg font-semibold">{screen}</p>
      ) : (
        <form action={confirmCancelAction} className="mt-6 space-y-4">
          <input type="hidden" name="subscriptionId" value={row.sub.id} />
          <p className="text-lg">{summary}</p>
          {saveOffer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border-2 border-ink p-4">
                <p className="text-lg font-semibold">Stay on this membership</p>
                <p className="mt-2 text-base">You can keep the membership and cancel later from this same page.</p>
              </div>
              <button className="rounded-2xl bg-ink px-4 py-4 text-lg font-semibold text-paper">Click to cancel</button>
            </div>
          ) : (
            <button className="rounded-full bg-ink px-5 py-3 text-base font-semibold text-paper">Confirm cancellation</button>
          )}
        </form>
      )}
    </div>
  );
}
