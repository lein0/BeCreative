import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Panel } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { teachers, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canEditTeacherContent } from "@/lib/permissions";

export default function ManagePage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const actor = await requireActor();
  if (!canEditTeacherContent(actor.roles, false)) redirect("/");
  const rows = await db.select({ teacher: teachers, person: user }).from(teachers).innerJoin(user, eq(user.id, teachers.userId));
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">Studios</h1>
      <p className="mt-2 text-sm text-ink/70">Edit classes, media, and schedules for any teacher. Platform finances stay with admins.</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Panel key={row.teacher.id}>
            <Link href={`/manage/teachers/${row.teacher.id}`} className="font-medium">{row.teacher.studioName}</Link>
            <p className="text-sm text-ink/60">{row.person.name} · {row.teacher.status}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
