import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassForm } from "@/components/class-form";
import { loadTeacherAccess } from "@/lib/actor";
import { categoryTree } from "@/lib/queries";
import { addDaysYmd, weekdayOfYmd, ymdInZone } from "@/lib/time";

export default function ManageNewClass({ params }: { params: Promise<{ teacherId: string }> }) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const access = await loadTeacherAccess(teacherId);
  if (!access) notFound();
  const categories = await categoryTree();
  let start = ymdInZone(new Date());
  for (let i = 0; i < 7 && weekdayOfYmd(start) !== 2; i += 1) start = addDaysYmd(start, 1);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="display mb-4 text-4xl">New class for {access.teacher.studioName}</h1>
      <ClassForm teacherId={teacherId} categories={categories} defaultStart={start} />
    </div>
  );
}
