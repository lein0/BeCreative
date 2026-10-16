import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Panel } from "@/components/bits";
import { loadTeacherAccess } from "@/lib/actor";
import { studioHome } from "@/lib/queries";

export default function ManageTeacher({ params }: { params: Promise<{ teacherId: string }> }) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const access = await loadTeacherAccess(teacherId);
  if (!access) notFound();
  if (!access.delegated && access.actor.roles.includes("teacher")) redirect("/teach");
  const home = await studioHome(teacherId);
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">{access.teacher.studioName}</h1>
      <p className="text-sm text-ink/60">Editing on behalf of this teacher is written to the audit log.</p>
      <div className="mt-4 space-y-2">
        {home.classRows.map((klass) => (
          <Panel key={klass.id}><Link href={`/manage/teachers/${teacherId}/classes/${klass.id}`}>{klass.title}</Link></Panel>
        ))}
      </div>
      <Link href={`/manage/teachers/${teacherId}/classes/new`} className="mt-4 inline-block rounded-full bg-clay px-4 py-2 text-sm text-white">New class</Link>
    </div>
  );
}
