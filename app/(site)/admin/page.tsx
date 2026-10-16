import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { OUTREACH_LABELS, type OutreachStatus } from "@/lib/constants";
import { adminStats } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function AdminPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const stats = await adminStats();
  const cards = [
    ["Pending teachers", String(stats.teachers.pending)],
    ["Approved teachers", String(stats.teachers.approved)],
    ["Classes", String(stats.classes)],
    ["Sessions", String(stats.sessions)],
    ["Bookings", String(stats.bookings)],
    ["Gross", money(stats.gross)],
    ["Platform fees", money(stats.fees)],
    ["Promo liability", money(stats.liability)],
    ["Signups", String(stats.signups)],
    ["Pack sales", String(stats.packSales)],
    ["Memberships", String(stats.membershipSales)],
  ];
  return (
    <div>
      <h1 className="display text-5xl">Platform</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => <Panel key={label}><p className="text-xs uppercase tracking-[0.14em] text-ink/50">{label}</p><p className="display text-3xl">{value}</p></Panel>)}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="display text-2xl">Leads by status</h2>
          <ul className="mt-2 text-sm">{stats.leadsByStatus.map(([status, count]) => <li key={status}>{OUTREACH_LABELS[status as OutreachStatus] ?? status}: {count}</li>)}</ul>
        </Panel>
        <Panel>
          <h2 className="display text-2xl">Leads by city</h2>
          <ul className="mt-2 text-sm">{stats.leadsByCity.map(([city, count]) => <li key={city}>{city}: {count}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}
