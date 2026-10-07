import Link from "next/link";
import { Suspense } from "react";
import { leadAction } from "@/lib/actions";
import { OUTREACH_LABELS, OUTREACH_STATUSES } from "@/lib/constants";
import { listLeads } from "@/lib/queries";

export default function KanbanPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const rows = await listLeads({});
  return (
    <div>
      <h1 className="display text-5xl">Pipeline</h1>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
        {OUTREACH_STATUSES.map((status) => (
          <section key={status} className="w-64 shrink-0 rounded-3xl bg-sand/70 p-3">
            <h2 className="text-sm font-medium">{OUTREACH_LABELS[status]}</h2>
            <div className="mt-2 space-y-2">
              {rows.filter((lead) => lead.outreachStatus === status).map((lead) => (
                <article key={lead.id} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-line">
                  <Link href={`/crm/${lead.id}`} className="font-medium">{lead.businessName}</Link>
                  <p className="text-ink/50">{lead.priority} · {lead.city}</p>
                  <form action={leadAction} className="mt-2">
                    <input type="hidden" name="command" value="status" />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select name="status" defaultValue={status} className="w-full rounded-xl border border-line px-2 py-1 text-xs" onChange={() => {}}>
                      {OUTREACH_STATUSES.map((option) => <option key={option} value={option}>{OUTREACH_LABELS[option]}</option>)}
                    </select>
                    <button className="mt-1 text-xs text-clay">Move</button>
                  </form>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
