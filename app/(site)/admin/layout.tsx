import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/actor";
import { canViewPlatformStats } from "@/lib/permissions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading admin…</p>}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!canViewPlatformStats(actor.roles)) redirect("/");
  const links = [["Overview", "/admin"], ["Teachers", "/admin/teachers"], ["Classes", "/admin/classes"], ["Users", "/admin/users"], ["Promos", "/admin/promos"], ["Settings", "/admin/settings"]];
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {links.map(([label, href]) => <Link key={href} href={href} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
