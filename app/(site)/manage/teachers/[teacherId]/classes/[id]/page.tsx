import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassStudio } from "@/components/class-studio";
import { loadTeacherAccess } from "@/lib/actor";

export default function ManageClass({ params }: { params: Promise<{ teacherId: string; id: string }> }) {
  return <Suspense fallback={null}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Promise<{ teacherId: string; id: string }> }) {
  const { teacherId, id } = await params;
  const access = await loadTeacherAccess(teacherId);
  if (!access) notFound();
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <ClassStudio classId={id} teacherId={teacherId} />
    </div>
  );
}
