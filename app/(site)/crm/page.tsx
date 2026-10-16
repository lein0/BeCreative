import Link from "next/link";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { leadAction } from "@/lib/actions";
import { control, Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { OUTREACH_LABELS, OUTREACH_STATUSES, PRIORITIES, type OutreachStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import { leadViews, user } from "@/lib/db/schema";
import { listLeads } from "@/lib/queries";
import { ymdInZone } from "@/lib/time";
import { one } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function CrmPage({ searchParams }: { searchParams: Search }) {
  return <Suspense fallback={null}><Body searchParams={searchParams} /></Suspense>;
}

async function Body({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const due = one(sp.due) === "1";
  const today = ymdInZone(new Date());
  const filters = { q: one(sp.q), city: one(sp.city), category: one(sp.category), status: one(sp.status), priority: one(sp.priority), rep: one(sp.rep) };
  let rows = await listLeads(filters);
  if (due) rows = rows.filter((lead) => lead.nextStepDue && lead.nextStepDue <= today && lead.assignedUserId === actor.id);
  const people = await db.select().from(user);
  const views = await db.select().from(leadViews).where(eq(leadViews.userId, actor.id));
  const names = new Map(people.map((person) => [person.id, person.name]));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-5xl">{due ? "My follow-ups due" : "Leads"}</h1>
        <Link href={due ? "/crm" : "/crm?due=1"} className="text-sm text-clay">{due ? "All leads" : "My follow-ups due"}</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {views.map((view) => {
          const params = new URLSearchParams(view.filters);
          return <Link key={view.id} href={`/crm?${params.toString()}`} className="rounded-full bg-sand px-3 py-1">{view.name}</Link>;
        })}
      </div>
      <form className="mt-4 grid gap-2 sm:grid-cols-3">
        <input name="q" defaultValue={filters.q} placeholder="Search" className={control} />
        <input name="city" defaultValue={filters.city} placeholder="City" className={control} />
        <input name="category" defaultValue={filters.category} placeholder="Category" className={control} />
        <select name="status" defaultValue={filters.status} className={control}>
          <option value="">Any status</option>
          {OUTREACH_STATUSES.map((status) => <option key={status} value={status}>{OUTREACH_LABELS[status]}</option>)}
        </select>
        <select name="priority" defaultValue={filters.priority} className={control}>
          <option value="">Any priority</option>
          {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
        </select>
        <select name="rep" defaultValue={filters.rep} className={control}>
          <option value="">Any rep</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Filter</button>
      </form>
      <form action={leadAction} className="mt-2 flex gap-2">
        <input type="hidden" name="command" value="save-view" />
        {Object.entries(filters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <input name="name" placeholder="Name this view" className={control} />
        <button className="rounded-full px-3 text-sm ring-1 ring-line">Save view</button>
      </form>
      <div className="mt-4 space-y-2">
        {rows.map((lead) => (
          <Panel key={lead.id}>
            <Link href={`/crm/${lead.id}`} className="font-medium">{lead.businessName}</Link>
            <p className="text-sm text-ink/60">{lead.neighborhood || lead.city} · {lead.category} · {OUTREACH_LABELS[lead.outreachStatus as OutreachStatus] ?? lead.outreachStatus} · {lead.priority} · {names.get(lead.assignedUserId ?? "") || "Unassigned"}{lead.nextStepDue ? ` · due ${lead.nextStepDue}` : ""}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
