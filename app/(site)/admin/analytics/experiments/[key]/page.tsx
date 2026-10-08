import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/bits";
import { experimentResults } from "@/lib/analytics-report";
import { rollOutWinnerAction, setExperimentStatusAction } from "@/lib/experiment-actions";

export default async function ExperimentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const result = await experimentResults(decodeURIComponent(key));
  if (!result) notFound();
  return (
    <div data-testid="experiment-results">
      <Link href="/admin/analytics" className="text-sm text-clay">Analytics</Link>
      <h1 className="display mt-3 text-5xl">{result.experiment.name}</h1>
      <p className="mt-2 text-sm text-ink/70">Goal: {result.experiment.goalEvent}. Status: {result.experiment.status}. Assignment is deterministic from the anonymous id or user id, including the mobile API.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={setExperimentStatusAction}><input type="hidden" name="key" value={result.experiment.key} /><input type="hidden" name="status" value="running" /><button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Start</button></form>
        <form action={setExperimentStatusAction}><input type="hidden" name="key" value={result.experiment.key} /><input type="hidden" name="status" value="stopped" /><button className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Stop</button></form>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {result.variants.map((variant) => (
          <Panel key={variant.key}>
            <h2 className="display text-2xl">{variant.key}</h2>
            <p className="mt-2 text-sm">{variant.exposed} exposed · {variant.converted} converted · {Math.round(variant.rate * 100)}%</p>
            <form action={rollOutWinnerAction} className="mt-3">
              <input type="hidden" name="key" value={result.experiment.key} />
              <input type="hidden" name="winner" value={variant.key} />
              <button className="rounded-full bg-clay px-3 py-1.5 text-sm text-white">Roll out winner</button>
            </form>
          </Panel>
        ))}
      </div>
      <Panel>
        <h2 className="display text-2xl">Against the first variant</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {result.compared.map((row) => (
            <li key={row.key}>{row.key}: uplift {Math.round(row.uplift * 100)}%, z {row.z.toFixed(2)}, p {row.p.toFixed(3)} · {row.significant ? "significant" : "not significant yet"}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
