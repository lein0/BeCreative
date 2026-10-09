import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { membershipSubscriptions, memberships, teachers } from "@/lib/db/schema";
import { formatRenewalDate } from "@/lib/renewal-copy";
import { money } from "@/lib/utils";

export default function MembershipsPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading memberships…</p>}>
      <List />
    </Suspense>
  );
}

async function List() {
  const actor = await requireActor();
  const rows = await db
    .select({ sub: membershipSubscriptions, plan: memberships, teacher: teachers })
    .from(membershipSubscriptions)
    .innerJoin(memberships, eq(memberships.id, membershipSubscriptions.membershipId))
    .innerJoin(teachers, eq(teachers.id, membershipSubscriptions.teacherId))
    .where(and(eq(membershipSubscriptions.userId, actor.id), ne(membershipSubscriptions.status, "cancelled")));
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <p className="text-sm"><Link href="/account">Account</Link> › Memberships</p>
      <h1 className="display mt-2 text-5xl">Memberships</h1>
      <div className="mt-6 space-y-4">
        {rows.length ? rows.map((row) => (
          <Panel key={row.sub.id}>
            <h2 className="text-xl font-semibold">{row.plan.name}</h2>
            <p className="mt-1 text-base">{row.teacher.studioName} · {money(row.sub.renewalPriceCents || row.plan.priceCents)} · {row.sub.cancelAtPeriodEnd ? `Ends ${formatRenewalDate(row.sub.currentPeriodEnd)}` : `Renews ${formatRenewalDate(row.sub.currentPeriodEnd)}`}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href={`/account/memberships/${row.sub.id}/terms`} className="underline">Membership terms</Link>
              {row.sub.cancelAtPeriodEnd ? null : <Link href={`/account/memberships/${row.sub.id}/cancel`} className="rounded-full bg-ink px-4 py-2 font-semibold text-paper">Cancel membership</Link>}
            </div>
          </Panel>
        )) : <p>You do not have a membership yet.</p>}
      </div>
    </div>
  );
}
