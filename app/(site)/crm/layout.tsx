import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { canManageLeads } from "@/lib/permissions";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="px-5 py-10">Loading leads…</p>}><Guard>{children}</Guard></Suspense>;
}

async function Guard({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!canManageLeads(actor.roles)) redirect("/");
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <nav className="mb-6 flex gap-2 text-sm">
        <Link className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" href="/crm">List</Link>
        <Link className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" href="/crm/kanban">Kanban</Link>
        <Link className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" href="/crm/import">Import</Link>
        <a className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" href="/api/admin/leads.csv">Export CSV</a>
      </nav>
      {children}
    </div>
  );
}
