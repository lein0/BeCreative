import { Suspense } from "react";
import { redirect } from "next/navigation";
import { StudioNav } from "@/components/studio-nav";
import { requireActor } from "@/lib/actor";
import { teacherByUser } from "@/lib/queries";

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Opening the studio…</p>}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!actor.roles.includes("teacher") && !actor.roles.includes("admin") && !actor.roles.includes("account_manager")) redirect("/");
  const teacher = await teacherByUser(actor.id);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {teacher?.status === "pending" ? <p className="mb-4 rounded-2xl bg-sand px-4 py-3 text-sm">Your studio is pending approval. You can draft classes, and they stay unpublished until an admin approves you.</p> : null}
      {teacher ? <StudioNav /> : null}
      {children}
    </div>
  );
}
