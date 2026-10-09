import { Suspense } from "react";
import { Panel, control } from "@/components/bits";
import { adminCancelMembershipAction, saveRenewalTemplateAction, toggleSaveOfferAction } from "@/lib/renewal-actions";
import { BUILTIN_TEMPLATES, formatRenewalDate } from "@/lib/renewal-copy";
import { activeTemplates, listRenewalSubscriptions, renewalSaveOfferEnabled } from "@/lib/renewal";

export default function AdminRenewalsPage({ searchParams }: { searchParams: Promise<{ error?: string; cancelled?: string; saved?: string }> }) {
  return (
    <Suspense fallback={<p>Loading renewals…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ error?: string; cancelled?: string; saved?: string }> }) {
  const query = await searchParams;
  const [rows, templates, saveOffer] = await Promise.all([listRenewalSubscriptions(), activeTemplates(), renewalSaveOfferEnabled()]);
  const copy = { ...BUILTIN_TEMPLATES, ...templates };
  return (
    <div className="space-y-8">
      <h1 className="display text-5xl">Renewals</h1>
      {query.error ? <p className="text-sm text-clay">{query.error}</p> : null}
      {query.cancelled ? <p className="text-sm">Cancellation confirmed. The member gets the same email they would from Account.</p> : null}
      {query.saved ? <p className="text-sm">A new copy version is active. Teachers still cannot edit it.</p> : null}
      <Panel>
        <h2 className="text-xl font-semibold">Cancel a membership</h2>
        <p className="mt-1 text-sm text-ink/70">One action stops renewal in Stripe and sends the confirmation email.</p>
        <form action={adminCancelMembershipAction} className="mt-3 flex flex-wrap gap-2">
          <input name="subscriptionId" required placeholder="Subscription id" className={control} />
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Cancel membership</button>
        </form>
        <ul className="mt-4 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.sub.id}>
              {row.person.email} · {row.plan.name} · {row.sub.cancelAtPeriodEnd ? `ends ${formatRenewalDate(row.sub.currentPeriodEnd)}` : formatRenewalDate(row.sub.currentPeriodEnd)} · {row.sub.id}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 className="text-xl font-semibold">Save offer</h2>
        <p className="mt-1 text-sm">Off unless an admin turns it on. Teachers cannot add their own save step.</p>
        <form action={toggleSaveOfferAction} className="mt-3">
          <label className="mr-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={saveOffer} /> Show one save offer next to Click to cancel</label>
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Save</button>
        </form>
      </Panel>
      <Panel>
        <h2 className="text-xl font-semibold">Locked copy · {copy.version}</h2>
        <p className="mt-1 text-sm">Only an admin with legal sign-off can publish a new version.</p>
        <form action={saveRenewalTemplateAction} className="mt-3 space-y-2">
          <textarea name="disclosureTitle" defaultValue={copy.disclosureTitle} className={control} rows={2} />
          <textarea name="disclosureCharge" defaultValue={copy.disclosureCharge} className={control} rows={4} />
          <textarea name="disclosureIntro" defaultValue={copy.disclosureIntro} className={control} rows={3} />
          <textarea name="checkbox" defaultValue={copy.checkbox} className={control} rows={3} />
          <input name="ackSubject" defaultValue={copy.ackSubject} className={control} />
          <textarea name="ackBody" defaultValue={copy.ackBody} className={control} rows={8} />
          <input name="cancelSubject" defaultValue={copy.cancelSubject} className={control} />
          <textarea name="cancelBody" defaultValue={copy.cancelBody} className={control} rows={4} />
          <input name="legalSignoff" required placeholder="Legal sign-off (name and date)" className={control} />
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Publish version</button>
        </form>
      </Panel>
    </div>
  );
}
