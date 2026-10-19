import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { feedbackDetailAction } from "@/lib/feedback-actions";
import { FEEDBACK_PRIORITIES, FEEDBACK_PRIORITY_LABELS, FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FEEDBACK_TYPES, type FeedbackPriority, type FeedbackStatus, type FeedbackType } from "@/lib/feedback-rules";
import { getFeedbackDetail, markInboxRead } from "@/lib/feedback-service";
import { mediaPath } from "@/lib/storage";

export default function FeedbackDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p>Loading note…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const detail = await getFeedbackDetail(id);
  if (!detail) notFound();
  await markInboxRead(id);
  const { row, events, deliveries, others, pin } = detail;
  const shot = mediaPath(row.screenshotKey);
  return (
    <div>
      <Link href="/admin/feedback" className="text-sm underline">All feedback</Link>
      <h1 className="display mt-2 text-5xl">{row.title || "Feedback"}</h1>
      <p className="mt-1 text-sm text-ink/60">
        {FEEDBACK_STATUS_LABELS[row.status as FeedbackStatus] ?? row.status}
        {" · "}
        {row.authorName} ({row.authorRole})
        {row.sensitive ? " · Sensitive" : ""}
      </p>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          {shot ? <img src={shot} alt="" className="max-h-80 w-full rounded-3xl object-cover object-top" /> : <p className="rounded-3xl bg-sand p-6 text-sm">No capture</p>}
          <p className="mt-3 text-sm">{row.body}</p>
          <p className="mt-2 text-sm"><Link href={pin} className="underline">Open the page with this pin</Link> · {row.route}</p>
          {row.selector ? <p className="mt-2 break-all text-xs text-ink/50">{row.selector}</p> : null}
          <h2 className="display mt-6 text-2xl">Thread</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id} className="rounded-2xl bg-white p-3 ring-1 ring-line">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/45">{event.actorName || "System"} · {event.kind}</p>
                <p>{event.body}</p>
              </li>
            ))}
          </ul>
          <h2 className="display mt-6 text-2xl">Deliveries</h2>
          <ul className="mt-2 text-sm">
            {deliveries.map((delivery) => <li key={delivery.id}>Attempt {delivery.attempt}: {delivery.status}{delivery.httpStatus ? ` (${delivery.httpStatus})` : ""}{delivery.error ? ` — ${delivery.error}` : ""}</li>)}
            {deliveries.length === 0 ? <li className="text-ink/60">Nothing sent yet.</li> : null}
          </ul>
        </div>
        <form action={feedbackDetailAction} className="space-y-3 rounded-3xl border border-line bg-mist p-4">
          <input type="hidden" name="id" value={row.id} />
          <label className="block text-sm">Type
            <select name="type" defaultValue={row.type} className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]">
              {FEEDBACK_TYPES.map((type) => <option key={type} value={type}>{FEEDBACK_TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <label className="block text-sm">Priority
            <select name="priority" defaultValue={row.priority} className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]">
              {FEEDBACK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{FEEDBACK_PRIORITY_LABELS[priority as FeedbackPriority]}</option>)}
            </select>
          </label>
          <label className="block text-sm">Title
            <input name="title" defaultValue={row.title ?? ""} className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]" />
          </label>
          <label className="block text-sm">Comment
            <textarea name="body" defaultValue={row.body} rows={4} className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2 text-[16px]" />
          </label>
          <button name="command" value="approve" className="h-10 rounded-full bg-moss px-4 text-sm text-white">Approve with these edits</button>
          <label className="block text-sm">Rejection reason
            <input name="reason" className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]" />
          </label>
          <button name="command" value="reject" className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line">Reject</button>
          <button name="command" value="resend" className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line">Resend webhook</button>
          {others.length ? (
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Merge duplicates into this note</legend>
              {others.map((other) => (
                <label key={other.id} className="flex items-center gap-2">
                  <input type="checkbox" name="merge" value={other.id} />
                  <span>{other.title || other.route} · {FEEDBACK_STATUS_LABELS[other.status as FeedbackStatus] ?? other.status}</span>
                </label>
              ))}
              <button name="command" value="merge" className="mt-2 h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line">Merge selected</button>
            </fieldset>
          ) : null}
          <p className="text-xs text-ink/50">Type label: {FEEDBACK_TYPE_LABELS[row.type as FeedbackType] ?? row.type}</p>
        </form>
      </div>
    </div>
  );
}
