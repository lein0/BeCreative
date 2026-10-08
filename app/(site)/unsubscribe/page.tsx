import { unsubscribeByToken } from "@/lib/notifications";

export default async function UnsubscribeQueryPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await unsubscribeByToken(token) : false;
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="display text-5xl">{ok ? "Unsubscribed" : "Link not found"}</h1>
      <p className="mt-3 text-ink/70">{ok ? "Marketing and booking emails will stop. You can turn booking notes back on from notification settings. A receipt for a class you paid for can still arrive." : "That unsubscribe link is no longer valid."}</p>
    </div>
  );
}
