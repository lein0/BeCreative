import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireActor } from "@/lib/actor";
import { membershipTerms } from "@/lib/renewal";

export default function MembershipTermsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading terms…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const terms = await membershipTerms(id, actor.id);
  if (!terms) notFound();
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <p className="text-sm"><Link href="/account">Account</Link> › <Link href="/account/memberships">Memberships</Link> › {terms.plan.name}</p>
      <h1 className="display mt-2 text-5xl">Membership terms</h1>
      <p className="mt-2 text-sm"><a className="underline" href={`/account/memberships/${id}/terms/pdf`}>Download PDF</a></p>
      <article className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-line">
        <p className="text-sm text-ink/70">From: {terms.legal.platformName} &lt;{terms.legal.notificationsEmail}&gt; on behalf of {terms.teacher.studioName || "Teacher"}</p>
        <h2 className="mt-3 text-xl font-semibold">{terms.mail.subject}</h2>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-base leading-6 text-ink">{terms.mail.text}</pre>
      </article>
    </div>
  );
}
