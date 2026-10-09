import { Suspense } from "react";
import { deleteAccountAction } from "@/lib/support-actions";
import { requireActor } from "@/lib/actor";
import { formatRenewalDate } from "@/lib/renewal-copy";
import { renewalsEndingWithAccount } from "@/lib/renewal";

export default function PrivacySettingsPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const ending = await renewalsEndingWithAccount(actor.id);
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="display text-5xl">Privacy</h1>
      <p className="mt-2 text-sm text-ink/70">Download a copy of your account, bookings, and receipts. Deleting the account removes your sign-in and replaces your name and email. Payment records stay so a refund or a dispute can still be answered.</p>
      <p className="mt-4 text-sm">Signed in as {actor.email}</p>
      <a href="/api/account/export" className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-sm text-paper">Download my data</a>
      {ending.length ? (
        <div className="mt-6 text-sm">
          <p className="font-semibold">Deleting your account stops these renewals first:</p>
          <ul className="mt-2 list-disc pl-5">
            {ending.map((row) => <li key={row.id}>{row.name} ends {formatRenewalDate(row.ends)}. You will not be charged again.</li>)}
          </ul>
        </div>
      ) : null}
      <form action={deleteAccountAction} className="mt-8">
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Delete my account</button>
      </form>
    </div>
  );
}
