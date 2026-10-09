import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { supportReplyAction } from "@/lib/support-actions";
import { control, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { ticketMessages, tickets } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";

export default function TeacherSupportPage() {
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
  const rows = await db.select().from(tickets).where(eq(tickets.teacherId, teacher.id));
  const messages = rows.length ? await db.select().from(ticketMessages) : [];
  return (
    <div>
      <h1 className="display text-5xl">Student questions</h1>
      <p className="mt-2 text-sm text-ink/70">Reply within a day. After that the note moves to the BeCreative team.</p>
      <div className="mt-6 space-y-4">
        {rows.map((ticket) => (
          <Panel key={ticket.id}>
            <p className="font-medium">{ticket.subject}</p>
            <p className="text-sm text-ink/60">{ticket.status} · {ticket.route}{ticket.slaDueAt ? ` · ${ticket.slaDueAt.toLocaleString()}` : ""}</p>
            {messages.filter((message) => message.ticketId === ticket.id && !message.internal).map((message) => (
              <p key={message.id} className="mt-2 text-sm">{message.body}</p>
            ))}
            <form action={supportReplyAction} className="mt-3 space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="back" value="/teach/support" />
              <label className="block text-sm">Reply<textarea name="body" required className={`${control} mt-1 min-h-20`} /></label>
              <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Send</button>
            </form>
          </Panel>
        ))}
        {!rows.length ? <p className="text-ink/60">No student tickets.</p> : null}
      </div>
    </div>
  );
}
