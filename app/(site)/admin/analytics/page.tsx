import Link from "next/link";
import { Panel } from "@/components/bits";
import { cohortRetention, listExperiments, platformKpis, rangeFromSearch, studentFunnel, teacherFunnel, topLists } from "@/lib/analytics-report";
import { money } from "@/lib/utils";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const filter = rangeFromSearch(search);
  const [kpis, students, teachers, cohorts, tops, experiments] = await Promise.all([
    platformKpis(filter),
    studentFunnel(filter),
    teacherFunnel(filter),
    cohortRetention(filter),
    topLists(filter),
    listExperiments(),
  ]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === "string" && value) query.set(key, value);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-5xl">Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/70">First-party events for the last {filter.days} days. Segment the student funnel with the filters. Card GMV, take, refunds, and disputes come from orders.</p>
        </div>
        <a className="rounded-full bg-ink px-4 py-2 text-sm text-paper" href={`/api/admin/analytics.csv?${query.toString()}`}>Export CSV</a>
      </div>
      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="get">
        <select name="days" defaultValue={String(filter.days)} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
        <input name="source" defaultValue={filter.source || ""} placeholder="Source" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <input name="utm" defaultValue={filter.utmSource} placeholder="UTM source" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <input name="share" defaultValue={filter.shareCode} placeholder="Share link" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <select name="vertical" defaultValue={filter.vertical || ""} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">
          <option value="">All verticals</option>
          <option value="creative">Creative</option>
          <option value="wellness">Wellness</option>
        </select>
        <select name="platform" defaultValue={filter.platform || ""} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">
          <option value="">All platforms</option>
          <option value="web">Web</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
        <input name="city" defaultValue={filter.city} placeholder="City" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <input name="device" defaultValue={filter.device} placeholder="Device" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <input name="category" defaultValue={filter.category} placeholder="Category" className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line" />
        <button className="rounded-full bg-clay px-4 py-1.5 text-white">Apply</button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="analytics-kpis">
        <Stat label="GMV" value={money(kpis.gmv)} />
        <Stat label="Take" value={money(kpis.take)} />
        <Stat label="Bookings" value={String(kpis.bookings)} />
        <Stat label="LTV estimate" value={money(Math.round(kpis.ltv))} />
        <Stat label="New students" value={String(kpis.newStudents)} />
        <Stat label="Active students" value={String(kpis.activeStudents)} />
        <Stat label="New teachers" value={String(kpis.newTeachers)} />
        <Stat label="Active teachers" value={String(kpis.activeTeachers)} />
        <Stat label="Repeat booking rate" value={percent(kpis.repeatRate)} />
        <Stat label="Refund rate" value={percent(kpis.refundRate)} />
        <Stat label="Dispute rate" value={percent(kpis.disputeRate)} />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Funnel title="Student funnel" steps={students} testId="student-funnel" />
        <Funnel title="Teacher funnel" steps={teachers} testId="teacher-funnel" />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="display text-2xl">Cohort retention</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-ink/50"><th>First booking</th><th>Students</th><th>Month 1</th><th>Month 2</th></tr></thead>
            <tbody>
              {cohorts.map(([month, row]) => (
                <tr key={month}><td>{month}</td><td>{row.size}</td><td>{percent(row.size ? row.month1 / row.size : 0)}</td><td>{percent(row.size ? row.month2 / row.size : 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel>
          <h2 className="display text-2xl">Top studios</h2>
          <ul className="mt-3 space-y-1 text-sm">{tops.teachers.map((row) => <li key={row.name}>{row.name} · {money(row.gmv)} · {row.bookings} orders</li>)}</ul>
          <h3 className="mt-4 text-sm font-medium">Traffic sources</h3>
          <ul className="mt-1 text-sm">{tops.sources.map((row) => <li key={row.source}>{row.source}: {row.count}</li>)}</ul>
        </Panel>
      </div>
      <Panel>
        <h2 className="display text-2xl">Experiments</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {experiments.map((experiment) => (
            <li key={experiment.id}><Link className="underline" href={`/admin/analytics/experiments/${experiment.key}`}>{experiment.name}</Link> · {experiment.status} · goal {experiment.goalEvent}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Panel><p className="text-xs uppercase tracking-[0.14em] text-ink/50">{label}</p><p className="display text-3xl">{value}</p></Panel>;
}

function Funnel({ title, steps, testId }: { title: string; steps: { name: string; count: number; conversion: number; dropOff: number }[]; testId: string }) {
  return (
    <Panel>
      <h2 className="display text-2xl" data-testid={testId}>{title}</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((step) => (
          <li key={step.name} className="flex items-center justify-between gap-3">
            <span>{step.name}</span>
            <span className="text-ink/70">{step.count} · {percent(step.conversion)} step · {percent(step.dropOff)} drop-off</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
