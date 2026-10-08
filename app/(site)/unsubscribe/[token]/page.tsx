import { unsubscribeByToken } from "@/lib/notifications";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await unsubscribeByToken(token);
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="display text-5xl">{ok ? "Unsubscribed" : "Link not found"}</h1>
      <p className="mt-3 text-ink/70">{ok ? "Booking emails will stop. You can turn them back on from notification settings." : "That unsubscribe link is no longer valid."}</p>
    </div>
  );
}
