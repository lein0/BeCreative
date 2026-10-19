import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Opening studios…</p>}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!actor.roles.includes("admin") && !actor.roles.includes("account_manager")) redirect("/");
  return children;
}
