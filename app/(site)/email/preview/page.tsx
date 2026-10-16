import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { canViewPlatformStats } from "@/lib/permissions";
import { templateIds } from "@/lib/email-templates";

export default async function EmailPreviewIndex() {
  if (process.env.NODE_ENV === "production") {
    const actor = await getActor();
    if (!actor || !canViewPlatformStats(actor.roles)) redirect("/login?next=/email/preview");
  }
  const ids = templateIds();
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">Email previews</h1>
      <p className="mt-2 text-sm text-ink/70">Light theme, built for a phone screen. Open any template as the message a student or teacher receives.</p>
      <ul className="mt-6 space-y-2">
        {ids.map((id) => (
          <li key={id}>
            <Link className="underline" href={`/email/preview/${encodeURIComponent(id)}`}>{id}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
