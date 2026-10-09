import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { markNotificationsAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading notifications…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(50);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="display text-5xl">Notifications</h1>
        <form action={markNotificationsAction}>
          <button className="text-sm text-clay">Mark all read</button>
        </form>
      </div>
      <p className="mt-2 text-sm"><Link href="/settings/notifications" className="text-clay">Notification settings</Link></p>
      <div className="mt-6 space-y-3">
        {rows.map((row) => (
          <Panel key={row.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="mt-1 text-sm text-ink/70">{row.body}</p>
                {row.href ? <Link href={row.href} className="mt-2 inline-block text-sm text-clay">Open</Link> : null}
              </div>
              {row.readAt ? <span className="text-xs text-ink/40">Read</span> : (
                <form action={markNotificationsAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="text-sm text-clay">Mark read</button>
                </form>
              )}
            </div>
          </Panel>
        ))}
        {!rows.length ? <p className="text-ink/60">No notifications yet.</p> : null}
      </div>
    </div>
  );
}
