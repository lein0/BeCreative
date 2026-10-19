import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ClassStudio } from "@/components/class-studio";
import { requireActor } from "@/lib/actor";
import { teacherByUser } from "@/lib/queries";

export default function TeachClassPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading class…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  return <ClassStudio classId={id} teacherId={teacher.id} />;
}
