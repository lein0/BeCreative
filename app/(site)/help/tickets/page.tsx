import Link from "next/link";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { tickets } from "@/lib/db/schema";

export const metadata = { title: "Your tickets" };

export default function StudentTicketsPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading tickets…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor("/help/tickets");
  const rows = await db.select().from(tickets).where(eq(tickets.userId, actor.id));
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="text-sm"><Link href="/help" className="text-clay">Help</Link></p>
      <h1 className="display mt-2 text-5xl">Your tickets</h1>
      <div className="mt-6 space-y-3">
        {rows.map((ticket) => {
          const href = ticket.status === "merged" && ticket.mergedIntoId ? `/help/tickets/${ticket.mergedIntoId}` : `/help/tickets/${ticket.id}`;
          return (
            <Panel key={ticket.id}>
              <Link href={href} className="display text-2xl">{ticket.subject}</Link>
              <p className="text-sm text-ink/60">{ticket.status}</p>
            </Panel>
          );
        })}
        {!rows.length ? <p className="text-ink/60">You have no tickets yet.</p> : null}
      </div>
    </div>
  );
}
