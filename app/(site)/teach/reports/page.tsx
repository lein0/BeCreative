import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { teacherByUser, teacherReport } from "@/lib/queries";
import { money } from "@/lib/utils";

export default function ReportsPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const report = await teacherReport(teacher.id);
  return (
    <div>
      <h1 className="display text-5xl">Reports</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bookings" value={String(report.bookings)} />
        <Stat label="Revenue" value={money(report.revenue)} />
        <Stat label="Fill rate" value={`${report.fill}%`} />
        <Stat label="Repeat students" value={String(report.repeats)} />
        <Stat label="Link clicks" value={String(report.clicks)} />
        <Stat label="Attributed bookings" value={String(report.attributed)} />
        <Stat label="Pack sales" value={String(report.packSales)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="display text-2xl">Clicks by source</h2>
          <ul className="mt-2 text-sm">{report.byRef.map(([ref, count]) => <li key={ref}>{ref}: {count}</li>)}</ul>
        </Panel>
        <Panel>
          <h2 className="display text-2xl">Promo performance</h2>
          <ul className="mt-2 text-sm">{report.codes.map((row) => <li key={row.code.id}>{row.code.code}: {row.redemptions} uses · {money(row.discount)} off</li>)}</ul>
        </Panel>
        <Panel>
          <h2 className="display text-2xl">Bookings by month</h2>
          <ul className="mt-2 text-sm">{report.weeks.map(([month, count]) => <li key={month}>{month}: {count}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Panel><p className="text-xs uppercase tracking-[0.14em] text-ink/50">{label}</p><p className="display text-3xl">{value}</p></Panel>;
}
