import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireActor } from "@/lib/actor";

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading account…</p>}>
      <Menu />
    </Suspense>
  );
}

async function Menu() {
  const actor = await requireActor();
  if (!actor) redirect("/login?next=/account");
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <h1 className="display text-5xl">Account</h1>
      <p className="mt-2 text-sm text-ink/70">Signed in as {actor.email}</p>
      <nav className="mt-6 grid gap-3 text-base">
        <Link href="/account/memberships" className="rounded-2xl bg-white px-4 py-4 font-semibold ring-1 ring-line">Memberships</Link>
        <Link href="/bookings" className="rounded-2xl bg-white px-4 py-4 ring-1 ring-line">Bookings</Link>
        <Link href="/settings/privacy" className="rounded-2xl bg-white px-4 py-4 ring-1 ring-line">Privacy and deletion</Link>
      </nav>
    </div>
  );
}
