import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShareButton } from "@/components/share-button";
import { requireActor } from "@/lib/actor";
import { studioHome, teacherByUser } from "@/lib/queries";
import { formatDateTimeInZone } from "@/lib/time";

export default function TeachHome() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const home = await studioHome(teacher.id);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-ink/50">{teacher.status}</p>
          <h1 className="display text-5xl">{teacher.studioName}</h1>
        </div>
        <ShareButton path={`/t/${teacher.slug}`} title={teacher.studioName || "Studio"} imageUrl={teacher.photoUrl} eyebrow="Your profile" />
      </div>
      <div className="mt-6 grid gap-3">
        {home.serviceRows.map((service) => (
          <Link key={service.id} href={`/teach/services/${service.id}`} className="flex items-center justify-between rounded-3xl bg-white px-4 py-3 ring-1 ring-line">
            <span>
              <span className="display text-2xl">{service.title}</span>
              <span className="ml-3 text-xs uppercase text-ink/50">{service.kind} · {service.status}</span>
            </span>
            <span className="text-sm text-clay">Roster</span>
          </Link>
        ))}
        {home.classRows.map((klass) => (
          <Link key={klass.id} href={`/teach/classes/${klass.id}`} className="flex items-center justify-between rounded-3xl bg-white px-4 py-3 ring-1 ring-line">
            <span>
              <span className="display text-2xl">{klass.title}</span>
              <span className="ml-3 text-xs uppercase text-ink/50">{klass.status}</span>
            </span>
            <span className="text-sm text-clay">Open</span>
          </Link>
        ))}
        {!home.classRows.length && !home.serviceRows.length ? <p>No classes yet. A weekly class or a private hour takes a handful of taps.</p> : null}
      </div>
      <h2 className="display mt-8 text-3xl">Coming up</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {home.upcoming.map((session) => (
          <li key={session.id}>
            <Link href={`/teach/sessions/${session.id}`}>{formatDateTimeInZone(session.startsAt)} · {session.status}</Link>
          </li>
        ))}
        {home.visitRows.map((row) => (
          <li key={row.visit.id}>
            <Link href={`/teach/services/${row.service.id}`}>{formatDateTimeInZone(row.visit.startsAt)} · {row.service.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
