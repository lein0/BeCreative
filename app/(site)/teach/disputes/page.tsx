import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { disputeAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { disputeNotes, disputes } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function TeacherDisputesPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) return null;
  const rows = await db.select().from(disputes).where(eq(disputes.teacherId, teacher.id));
  const notes = rows.length ? await db.select().from(disputeNotes) : [];
  return (
    <div>
      <h1 className="display text-5xl">Disputes</h1>
      <p className="mt-2 text-sm text-ink/70">Add what you remember. Admin submits the packet to the card network.</p>
      <div className="mt-6 space-y-4">
        {rows.map((row) => (
            <Panel key={row.id}>
              <p className="font-medium">{row.reason} · {money(row.amountCents)} · {row.evidenceStatus}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink/70">{row.summary.slice(0, 500)}</p>
              {notes.filter((note) => note.disputeId === row.id).map((note) => <p key={note.id} className="mt-2 text-sm">{note.body}</p>)}
              <form action={disputeAction} className="mt-3 space-y-2">
                <input type="hidden" name="disputeId" value={row.id} />
                <input type="hidden" name="command" value="note" />
                <input type="hidden" name="back" value="/teach/disputes" />
                <label className="block text-sm">Note for this dispute<textarea name="body" required className={`${control} mt-1 min-h-20`} /></label>
                <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Add note</button>
              </form>
            </Panel>
        ))}
        {!rows.length ? <p className="text-ink/60">No disputes on your sales.</p> : null}
      </div>
    </div>
  );
}
