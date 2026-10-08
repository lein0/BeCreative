import { Suspense } from "react";
import { notFound } from "next/navigation";
import { rosterAction, teacherCancelAction } from "@/lib/actions";
import { Panel, control } from "@/components/bits";
import { loadTeacherAccess } from "@/lib/actor";
import { roster } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";
import { one } from "@/lib/utils";

export default function RosterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p>Loading roster…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const error = one((await searchParams).error);
  const data = await roster(id);
  if (!data?.klass) notFound();
  const access = await loadTeacherAccess(data.klass.teacherId);
  if (!access) notFound();
  const teacher = access.teacher;
  return (
    <div>
      <h1 className="display text-5xl">{data.klass?.title}</h1>
      <p className="text-ink/60">{formatDateTimeInZone(data.session.startsAt)} · capacity {data.session.capacity}</p>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      <p className="mt-2 text-sm"><a className="text-clay" href={`/api/sessions/${id}/roster.csv`}>Download CSV</a></p>
      <div className="mt-4 space-y-2">
        {data.people.map((person) => (
          <Panel key={person.link.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{person.student?.name || person.booking.guestName}</p>
                <p className="text-sm text-ink/60">{person.student?.email || person.booking.guestEmail} · {person.order?.status ?? person.booking.source} · {person.link.checkedIn ? "checked in" : "not checked in"}</p>
              </div>
              <form action={rosterAction}>
                <input type="hidden" name="command" value="checkin" />
                <input type="hidden" name="linkId" value={person.link.id} />
                <input type="hidden" name="checked" value={person.link.checkedIn ? "0" : "1"} />
                <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">{person.link.checkedIn ? "Undo" : "Check in"}</button>
              </form>
            </div>
          </Panel>
        ))}
      </div>
      <form action={rosterAction} className="mt-6 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="command" value="manual" />
        <input type="hidden" name="classId" value={data.klass?.id} />
        <input type="hidden" name="sessionId" value={id} />
        <input name="name" placeholder="Guest name" className={control} required />
        <input name="email" placeholder="Guest email" className={control} required />
        <select name="payment" className={control}>
          <option value="pay_at_studio">Pay at studio</option>
          <option value="paid">Paid offline</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="override" /> Override capacity</label>
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Add manual booking</button>
      </form>
      <form action={rosterAction} className="mt-6 space-y-2">
        <input type="hidden" name="command" value="email" />
        <input type="hidden" name="sessionId" value={id} />
        <input type="hidden" name="teacherId" value={teacher.id} />
        <input type="hidden" name="back" value={`/teach/sessions/${id}`} />
        <input name="subject" placeholder="Subject" className={control} required />
        <textarea name="body" placeholder="Note to booked students" className={`${control} min-h-24`} required />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includePast" /> Include past attendees of this class</label>
        <button className="rounded-full bg-moss px-4 py-2 text-sm text-paper">Email roster</button>
      </form>
      <form action={teacherCancelAction} className="mt-8 space-y-3 rounded-3xl bg-white p-4 ring-1 ring-line" data-testid="teacher-cancel">
        <h2 className="display text-3xl">Cancel this date</h2>
        <p className="text-sm text-ink/70">Everyone booked gets a full refund to their original payment method. Studio credit is used only when that student has opted in.</p>
        <input type="hidden" name="sessionId" value={id} />
        <input type="hidden" name="classId" value={data.klass.id} />
        <input type="hidden" name="back" value={`/teach/sessions/${id}`} />
        <label className="block text-sm">Reason (optional)<input name="reason" className={`${control} mt-1`} placeholder="Weather, illness, studio emergency" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wantCredit" value="1" /> Offer studio credit instead, only if the student opted in</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mass" value="1" /> Cancel every upcoming date in this series</label>
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Cancel and refund</button>
      </form>
    </div>
  );
}
