import { desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { adminRefundAction } from "@/lib/actions";
import { Panel, control } from "@/components/bits";
import { db } from "@/lib/db";
import { refundLedger } from "@/lib/db/schema";
import { money } from "@/lib/utils";

export default function RefundsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const query = await searchParams;
  const jar = await cookies();
  const idempotencyKey = jar.get("admin_refund_key")?.value || crypto.randomUUID();
  const rows = await db.select().from(refundLedger).orderBy(desc(refundLedger.createdAt)).limit(40);
  return (
    <div>
      <h1 className="display text-5xl">Refunds</h1>
      {query.error ? <p className="mt-3 text-sm text-clay">{query.error}</p> : null}
      {query.ok ? <p className="mt-3 text-sm">Refund recorded.</p> : null}
      <form action={adminRefundAction} className="mt-4 grid max-w-lg gap-2">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <label className="text-sm">Order id<input name="orderId" required className={control} /></label>
        <label className="text-sm">Amount in dollars (leave blank with full refund)<input name="amount" className={control} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="full" value="1" defaultChecked /> Full remaining balance</label>
        <label className="text-sm">Reason code
          <select name="reason" className={control}>
            <option value="admin_goodwill">Goodwill</option>
            <option value="duplicate">Duplicate</option>
            <option value="teacher_cancel">Teacher cancel</option>
            <option value="student_cancel">Student cancel</option>
            <option value="service">Service issue</option>
          </select>
        </label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Issue refund</button>
      </form>
      <div className="mt-6 space-y-2">
        {rows.map((row) => (
          <Panel key={row.id}>{row.reasonCode} · {money(row.amountCents)} · fee {money(row.feeReversedCents)} · transfer {money(row.transferReversedCents)} · {row.status}</Panel>
        ))}
        {!rows.length ? <p className="text-sm text-ink/60">No refunds in the ledger yet.</p> : null}
      </div>
    </div>
  );
}
