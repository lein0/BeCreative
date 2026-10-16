import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { scheduleCommandAction } from "@/lib/actions";
import { fromPrice, Panel } from "@/components/bits";
import { ScheduleComposer } from "@/components/schedule-composer";
import { ShareButton } from "@/components/share-button";
import { Uploader } from "@/components/uploader";
import { ClassForm } from "@/components/class-form";
import { db } from "@/lib/db";
import { auditLog, promoCodes, teachers } from "@/lib/db/schema";
import { describeRecurrence, type RecurrenceRule } from "@/lib/recurrence";
import { categoryTree, classStudio } from "@/lib/queries";
import { addDaysYmd, formatDateTimeInZone, weekdayOfYmd, ymdInZone } from "@/lib/time";

export async function ClassStudio({ classId, teacherId }: { classId: string; teacherId: string }) {
  const studio = await classStudio(classId);
  if (!studio || studio.klass.teacherId !== teacherId) return <p>Class not found.</p>;
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  const codes = await db.select().from(promoCodes).where(eq(promoCodes.teacherId, teacherId));
  const audits = await db.select().from(auditLog).where(eq(auditLog.onBehalfOfTeacherId, teacherId)).orderBy(desc(auditLog.createdAt)).limit(6);
  const categories = await categoryTree();
  let start = ymdInZone(new Date());
  for (let i = 0; i < 7 && weekdayOfYmd(start) !== 2; i += 1) start = addDaysYmd(start, 1);
  const base = teacher ? `/t/${teacher.slug}` : "";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{studio.klass.status}</p>
          <h1 className="display text-5xl">{studio.klass.title}</h1>
          <p className="text-ink/70">{fromPrice(studio.klass.pricePerSessionCents, studio.klass.pricePerSeriesCents)} · {studio.klass.durationMinutes} min · {studio.klass.maxSize} seats</p>
        </div>
        {teacher ? (
          <ShareButton
            path={`/c/${studio.klass.slug}`}
            title={studio.klass.title}
            eyebrow={teacher.studioName ?? ""}
            priceLabel={fromPrice(studio.klass.pricePerSessionCents, studio.klass.pricePerSeriesCents)}
            imageUrl={studio.klass.coverImageUrl}
            promos={codes.filter((code) => code.active).map((code) => ({ code: code.code }))}
          />
        ) : null}
      </div>
      <Uploader classId={classId} />
      <div className="flex gap-2 overflow-x-auto">
        {studio.media.map((item) => (
          item.type === "video" ? <video key={item.id} src={item.url} className="h-28 rounded-2xl" controls /> : <img key={item.id} src={item.url} alt="" className="h-28 rounded-2xl object-cover" />
        ))}
      </div>
      {studio.rules.map((rule) => {
        const recurrence: RecurrenceRule = {
          timezone: rule.timezone,
          frequency: rule.frequency as RecurrenceRule["frequency"],
          days: rule.days,
          startDate: rule.startDate,
          endType: rule.endType as RecurrenceRule["endType"],
          endDate: rule.endDate,
          endCount: rule.endCount,
        };
        return (
          <Panel key={rule.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{rule.paused ? "Paused" : "Repeating"}</p>
                <p className="text-lg">{describeRecurrence(recurrence)}</p>
              </div>
              <form action={scheduleCommandAction}>
                <input type="hidden" name="teacherId" value={teacherId} />
                <input type="hidden" name="recurrenceId" value={rule.id} />
                <input type="hidden" name="command" value={rule.paused ? "resume" : "pause"} />
                <button className="rounded-full bg-moss px-4 py-2 text-sm text-paper">{rule.paused ? "Resume series" : "Pause series"}</button>
              </form>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-clay">Change all future sessions</summary>
              <form action={scheduleCommandAction} className="mt-3">
                <input type="hidden" name="teacherId" value={teacherId} />
                <input type="hidden" name="recurrenceId" value={rule.id} />
                <input type="hidden" name="command" value="reshape" />
                <ScheduleComposer allowOnce={false} defaultStart={rule.startDate || start} duration={rule.durationMinutes} initial={recurrence} />
                <button className="mt-3 rounded-full bg-ink px-4 py-2 text-sm text-paper">Update future dates</button>
              </form>
            </details>
          </Panel>
        );
      })}
      <div className="space-y-2">
        {studio.upcoming.map((session) => (
          <div key={session.id} className="rounded-2xl bg-white px-3 py-3 text-sm ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/teach/sessions/${session.id}`} className="font-medium">{formatDateTimeInZone(session.startsAt)} · {session.status}{session.exception ? ` · ${session.exception}` : ""}</Link>
              {teacher ? <ShareButton path={`/c/${studio.klass.slug}?session=${session.localDate}`} title={`${studio.klass.title} · ${session.localDate}`} when={session.localDate} imageUrl={studio.klass.coverImageUrl} /> : null}
            </div>
            {session.status === "scheduled" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={scheduleCommandAction}>
                  <input type="hidden" name="teacherId" value={teacherId} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="command" value="skip" />
                  <button className="rounded-full px-3 py-1 ring-1 ring-line">Skip this date</button>
                </form>
                <form action={scheduleCommandAction} className="flex gap-2">
                  <input type="hidden" name="teacherId" value={teacherId} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="command" value="move" />
                  <input type="date" name="date" defaultValue={session.localDate} className="rounded-xl border border-line px-2 py-1" />
                  <input type="time" name="time" defaultValue="19:00" className="rounded-xl border border-line px-2 py-1" />
                  <button className="rounded-full bg-sand px-3 py-1">Move</button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Edit class details</summary>
        <div className="mt-4">
          <ClassForm
            teacherId={teacherId}
            classId={classId}
            categories={categories}
            defaultStart={start}
            initial={{
              title: studio.klass.title,
              description: studio.klass.description,
              priceSession: studio.klass.pricePerSessionCents != null ? String(studio.klass.pricePerSessionCents / 100) : "",
              priceSeries: studio.klass.pricePerSeriesCents != null ? String(studio.klass.pricePerSeriesCents / 100) : "",
              maxSize: studio.klass.maxSize,
              duration: studio.klass.durationMinutes,
              skillLevel: studio.klass.skillLevel,
              format: studio.klass.format,
              delivery: studio.klass.delivery,
              address: studio.location?.addressLine1,
              neighborhood: studio.location?.neighborhood,
              venue: studio.location?.name ?? "",
              virtualLink: studio.klass.virtualLink ?? "",
              categoryId: studio.klass.categoryId,
            }}
          />
        </div>
      </details>
      {audits.length ? (
        <Panel>
          <h2 className="display text-2xl">Audit</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {audits.map((entry) => <li key={entry.id}>{entry.summary}</li>)}
          </ul>
        </Panel>
      ) : null}
      {base ? <p className="text-sm"><Link href={`${base}/bio`}>Link in bio</Link></p> : null}
    </div>
  );
}
