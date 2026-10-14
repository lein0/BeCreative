import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/notifications";
import { unsubscribeConfirmedBy } from "@/lib/notify-prefs";

async function confirmUnsubscribe(formData: FormData) {
  "use server";
  if (!unsubscribeConfirmedBy("POST")) return;
  const token = String(formData.get("token") ?? "");
  const ok = await unsubscribeByToken(token);
  redirect(ok ? `/unsubscribe/${encodeURIComponent(token)}?done=1` : `/unsubscribe/${encodeURIComponent(token)}?missing=1`);
}

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; missing?: string }> }) {
  const { token } = await params;
  const { done, missing } = await searchParams;
  if (done === "1") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="display text-5xl">Unsubscribed</h1>
        <p className="mt-3 text-ink/70">Booking emails will stop. You can turn them back on from notification settings.</p>
      </div>
    );
  }
  if (missing === "1") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="display text-5xl">Link not found</h1>
        <p className="mt-3 text-ink/70">That unsubscribe link is no longer valid.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="display text-5xl">Unsubscribe</h1>
      <p className="mt-3 text-ink/70">Confirm and booking emails will stop. You can turn them back on from notification settings.</p>
      <form action={confirmUnsubscribe} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Unsubscribe</button>
      </form>
    </div>
  );
}
