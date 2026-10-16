import { Suspense } from "react";
import { approveTeacherAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { teachers, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default function TeachersAdmin() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const rows = await db.select({ teacher: teachers, person: user }).from(teachers).innerJoin(user, eq(user.id, teachers.userId));
  return (
    <div>
      <h1 className="display text-5xl">Teachers</h1>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Panel key={row.teacher.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{row.teacher.studioName} · {row.teacher.status}</p>
                <p className="text-sm text-ink/60">{row.person.name} · {row.person.email}</p>
              </div>
              <div className="flex gap-2">
                <form action={approveTeacherAction}><input type="hidden" name="teacherId" value={row.teacher.id} /><input type="hidden" name="status" value="approved" /><button className="rounded-full bg-moss px-3 py-1.5 text-sm text-paper">Approve</button></form>
                <form action={approveTeacherAction}><input type="hidden" name="teacherId" value={row.teacher.id} /><input type="hidden" name="status" value="rejected" /><input type="hidden" name="reason" value="Not a fit right now" /><button className="rounded-full px-3 py-1.5 text-sm ring-1 ring-line">Reject</button></form>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
