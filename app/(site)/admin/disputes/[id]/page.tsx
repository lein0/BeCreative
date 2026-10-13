import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { disputeAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { disputeNotes, disputes } from "@/lib/db/schema";

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!row) notFound();
  const notes = await db.select().from(disputeNotes).where(eq(disputeNotes.disputeId, id));
  return (
    <div>
      <h1 className="display text-4xl">{row.reason}</h1>
      <p className="mt-2 text-sm text-ink/60">{row.status} · {row.evidenceStatus}</p>
      <form action={disputeAction} className="mt-4 space-y-2">
        <input type="hidden" name="disputeId" value={row.id} />
        <input type="hidden" name="back" value={`/admin/disputes/${row.id}`} />
        <label className="block text-sm">Evidence summary
          <textarea name="summary" defaultValue={row.summary} className={`${control} mt-1 min-h-48`} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button name="command" value="edit" className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save summary</button>
          <button name="command" value="hold" className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Hold</button>
          <button name="command" value="submit" className="rounded-full bg-clay px-3 py-1.5 text-sm text-white">Submit now</button>
        </div>
        <label className="text-sm">Amount bearer<input name="amountBearer" defaultValue={row.amountBearer} className={control} /></label>
        <label className="text-sm">Fee bearer<input name="feeBearer" defaultValue={row.feeBearer} className={control} /></label>
        <button name="command" value="liability" className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Override liability</button>
      </form>
      <div className="mt-6 space-y-2">
        {notes.map((note) => <Panel key={note.id}>{note.body}</Panel>)}
      </div>
    </div>
  );
}
