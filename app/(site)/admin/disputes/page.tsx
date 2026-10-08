import Link from "next/link";
import { desc } from "drizzle-orm";
import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { disputes } from "@/lib/db/schema";
import { liabilityFor } from "@/lib/disputes";
import { money } from "@/lib/utils";

export default function DisputesPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const rows = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
  return (
    <div>
      <h1 className="display text-5xl">Disputes</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Evidence is assembled when a dispute opens and submitted about 48 hours before the deadline, or right away if the student was checked in. Hold a case to edit it first.</p>
      <div className="mt-6 space-y-3">
        {rows.map((row) => {
          const liability = liabilityFor(row);
          return (
            <Panel key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.reason} · {money(row.amountCents)}</p>
                  <p className="text-sm text-ink/60">{row.status} · evidence {row.evidenceStatus}{row.dueBy ? ` · due ${row.dueBy.toLocaleString()}` : ""}</p>
                  <p className="text-sm text-ink/60">Teacher bears {money(liability.teacherAmountCents)} · platform fee {money(liability.platformFeeCents)}</p>
                </div>
                <Link href={`/admin/disputes/${row.id}`} className="text-sm text-clay">Open</Link>
              </div>
            </Panel>
          );
        })}
        {!rows.length ? <p className="text-sm text-ink/60">No disputes yet.</p> : null}
      </div>
    </div>
  );
}
