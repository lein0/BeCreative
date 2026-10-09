import { Suspense } from "react";
import { featureAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { db } from "@/lib/db";
import { classes, teachers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default function AdminClasses() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const rows = await db.select({ klass: classes, teacher: teachers }).from(classes).innerJoin(teachers, eq(teachers.id, classes.teacherId));
  return (
    <div>
      <h1 className="display text-5xl">Classes</h1>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Panel key={row.klass.id}>
            <div className="flex items-center justify-between gap-3">
              <span>{row.klass.title} · {row.teacher.studioName} · {row.klass.status}{row.klass.featured ? " · featured" : ""}</span>
              <form action={featureAction}>
                <input type="hidden" name="classId" value={row.klass.id} />
                <input type="hidden" name="featured" value={row.klass.featured ? "0" : "1"} />
                <button className="text-sm text-clay">{row.klass.featured ? "Unfeature" : "Feature"}</button>
              </form>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
