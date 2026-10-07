import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { leadAction } from "@/lib/actions";
import { control, Panel } from "@/components/bits";
import { OUTREACH_LABELS, OUTREACH_STATUSES, type OutreachStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import { leadActivities, leads, user } from "@/lib/db/schema";

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) notFound();
  const activities = await db.select().from(leadActivities).where(eq(leadActivities.leadId, id)).orderBy(desc(leadActivities.createdAt));
  const people = await db.select().from(user);
  const names = new Map(people.map((person) => [person.id, person.name]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-clay">{lead.priority} · {OUTREACH_LABELS[lead.outreachStatus as OutreachStatus]}</p>
        <h1 className="display text-5xl">{lead.businessName}</h1>
        <p className="mt-2 text-ink/70">{lead.category} {lead.subcategory} · {lead.neighborhood}, {lead.city}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <Panel>Contact {lead.contactName} · {lead.contactRole}<br />{lead.email}<br />{lead.phone}</Panel>
          <Panel>{lead.website}<br />IG {lead.instagram} · TikTok {lead.tiktok}<br />Rating {lead.rating} ({lead.reviewCount ?? 0})</Panel>
        </dl>
        <p className="mt-4 text-sm">{lead.notes}</p>
        <form action={leadAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="command" value="status" />
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="status" defaultValue={lead.outreachStatus} className={control}>
            {OUTREACH_STATUSES.map((status) => <option key={status} value={status}>{OUTREACH_LABELS[status]}</option>)}
          </select>
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Update status</button>
        </form>
        <form action={leadAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="command" value="due" />
          <input type="hidden" name="leadId" value={lead.id} />
          <input name="nextStep" defaultValue={lead.nextStep} placeholder="Next step" className={control} />
          <input name="due" type="date" defaultValue={lead.nextStepDue ?? ""} className={control} />
          <button className="rounded-full px-4 py-2 text-sm ring-1 ring-line">Save next step</button>
        </form>
        <form action={leadAction} className="mt-4">
          <input type="hidden" name="command" value="convert" />
          <input type="hidden" name="leadId" value={lead.id} />
          <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">{lead.convertedTeacherId ? "Already converted" : "Convert to teacher"}</button>
        </form>
      </div>
      <div>
        <h2 className="display text-3xl">Activity</h2>
        <form action={leadAction} className="mt-3 space-y-2">
          <input type="hidden" name="command" value="activity" />
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="type" className={control}><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="dm">DM</option><option value="meeting">Meeting</option></select>
          <textarea name="body" required className={`${control} min-h-24`} placeholder="What happened" />
          <button className="rounded-full bg-moss px-4 py-2 text-sm text-paper">Log</button>
        </form>
        <ul className="mt-4 space-y-2 text-sm">
          {activities.map((item) => (
            <li key={item.id} className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <p className="text-xs uppercase text-ink/50">{item.type} · {names.get(item.authorUserId ?? "") || "System"} · {item.createdAt.toLocaleString()}</p>
              <p className="mt-1">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
