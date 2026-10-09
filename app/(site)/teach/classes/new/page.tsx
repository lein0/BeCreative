import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ClassForm } from "@/components/class-form";
import { requireActor } from "@/lib/actor";
import { addDaysYmd, weekdayOfYmd, ymdInZone } from "@/lib/time";
import { categoryTree, teacherByUser } from "@/lib/queries";

export default function NewClassPage() {
  return (
    <Suspense fallback={<p>Loading the form…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const categories = await categoryTree();
  let start = ymdInZone(new Date());
  for (let i = 0; i < 7 && weekdayOfYmd(start) !== 2; i += 1) start = addDaysYmd(start, 1);
  return (
    <div>
      <h1 className="display mb-6 text-5xl">New class</h1>
      <ClassForm teacherId={teacher.id} categories={categories} defaultStart={start} />
    </div>
  );
}
