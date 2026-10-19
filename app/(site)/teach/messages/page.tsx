import { desc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";

export default function MessagesPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.teacherId, teacher.id)).orderBy(desc(emailOutbox.createdAt)).limit(20);
  return (
    <div>
      <h1 className="display text-5xl">Messages</h1>
      <p className="mt-2 text-sm text-ink/70">Email goes through the provider interface. Locally that is the console outbox.</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Panel key={row.id}>
            <p className="font-medium">{row.subject}</p>
            <p className="text-sm text-ink/60">{row.toAddresses.join(", ")} · {row.status}</p>
            <p className="mt-2 text-sm">{row.textBody}</p>
          </Panel>
        ))}
        {!rows.length ? <p className="text-ink/60">No messages yet. Email a roster from a session.</p> : null}
      </div>
    </div>
  );
}
