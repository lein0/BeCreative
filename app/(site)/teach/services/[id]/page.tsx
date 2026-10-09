import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { teacherCancelVisitAction } from "@/lib/actions";
import { Panel, control } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { teacherByUser } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";
import { visitRoster } from "@/lib/wellness-service";

export default function ServiceRosterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading the roster…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  const roster = await visitRoster(id);
  if (!roster) notFound();
  if (!teacher || roster.service.teacherId !== teacher.id) redirect("/teach");
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-ink/50">{roster.service.kind === "access" ? "Slot roster" : "Appointment roster"}</p>
      <h1 className="display text-5xl">{roster.service.title}</h1>
      <div className="mt-6 space-y-3">
        {roster.visits.map((row) => {
          const signature = roster.signatures.find((item) => item.id === row.visit.waiverSignatureId) ?? roster.signatures.find((item) => item.userId === row.visit.userId);
          return (
            <Panel key={row.visit.id}>
              <p className="display text-2xl">{row.student?.name ?? "Guest"}</p>
              <p className="text-sm text-ink/70">{formatDateTimeInZone(row.visit.startsAt)} – {formatDateTimeInZone(row.visit.endsAt)}</p>
              <p className="mt-2 text-sm">{signature ? `Waiver v${signature.version} signed by ${signature.signedName} · ${formatDateTimeInZone(signature.signedAt)}${signature.ip ? ` · ${signature.ip}` : ""}` : "No waiver on file"}</p>
              <form action={teacherCancelVisitAction} className="mt-3 space-y-2">
                <input type="hidden" name="visitId" value={row.visit.id} />
                <input type="hidden" name="back" value={`/teach/services/${id}`} />
                <input name="reason" placeholder="Reason (optional)" className={control} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wantCredit" value="1" /> Credit only if they opted in</label>
                <button className="rounded-full bg-clay px-3 py-1.5 text-sm text-white">Cancel and refund</button>
              </form>
            </Panel>
          );
        })}
        {!roster.visits.length ? <p className="text-ink/60">No confirmed visits yet.</p> : null}
      </div>
    </div>
  );
}
