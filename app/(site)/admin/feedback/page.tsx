import Link from "next/link";
import { Suspense } from "react";
import { feedbackInboxAction } from "@/lib/feedback-actions";
import { FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FEEDBACK_TYPES, pinPath, type FeedbackStatus, type FeedbackType } from "@/lib/feedback-rules";
import { listAuthors, listInbox } from "@/lib/feedback-service";
import { mediaPath } from "@/lib/storage";
import { one } from "@/lib/utils";

export default function FeedbackInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p>Loading feedback…</p>}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = one(params.status);
  const authorId = one(params.author);
  const type = one(params.type);
  const page = one(params.page);
  const error = one(params.error);
  const [rows, authors] = await Promise.all([
    listInbox({ status, authorId, type, page }),
    listAuthors(),
  ]);
  return (
    <div data-testid="feedback-inbox">
      <h1 className="display text-5xl">Feedback</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Admin notes go straight to the fix loop. Account manager notes wait here until you approve or reject them.</p>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <select name="status" defaultValue={status} className="h-10 rounded-full border border-line bg-white px-3 text-sm">
          <option value="">All statuses</option>
          {FEEDBACK_STATUSES.map((value) => <option key={value} value={value}>{FEEDBACK_STATUS_LABELS[value]}</option>)}
        </select>
        <select name="author" defaultValue={authorId} className="h-10 rounded-full border border-line bg-white px-3 text-sm">
          <option value="">All authors</option>
          {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
        </select>
        <select name="type" defaultValue={type} className="h-10 rounded-full border border-line bg-white px-3 text-sm">
          <option value="">All types</option>
          {FEEDBACK_TYPES.map((value) => <option key={value} value={value}>{FEEDBACK_TYPE_LABELS[value]}</option>)}
        </select>
        <input name="page" defaultValue={page} placeholder="Route" className="h-10 rounded-full border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-full bg-ink px-4 text-sm text-paper">Filter</button>
      </form>
      <form action={feedbackInboxAction} className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button name="command" value="approve" className="h-10 rounded-full bg-moss px-4 text-sm text-white">Approve</button>
          <input name="reason" placeholder="Rejection reason" className="h-10 min-w-48 rounded-full border border-line bg-white px-3 text-sm" />
          <button name="command" value="reject" className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line">Reject</button>
        </div>
        <ul className="space-y-3">
          {rows.map((row) => {
            const shot = mediaPath(row.screenshotKey);
            return (
              <li key={row.id} className="grid gap-3 rounded-3xl border border-line bg-mist p-4 sm:grid-cols-[8rem_1fr]">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="ids" value={row.id} className="mt-1 h-4 w-4" />
                  {shot ? <img src={shot} alt="" className="h-24 w-full rounded-2xl object-cover object-top" /> : <span className="flex h-24 w-full items-center justify-center rounded-2xl bg-sand text-xs text-ink/50">No capture</span>}
                </label>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-ink/50">
                    {!row.inboxReadAt ? "Unread · " : ""}
                    {FEEDBACK_STATUS_LABELS[row.status as FeedbackStatus] ?? row.status}
                    {" · "}
                    {FEEDBACK_TYPE_LABELS[row.type as FeedbackType] ?? row.type}
                    {row.sensitive ? " · Sensitive" : ""}
                  </p>
                  <h2 className="display text-2xl">{row.title || row.body}</h2>
                  <p className="text-sm text-ink/70">{row.authorName} · {row.route}</p>
                  <p className="mt-1 text-sm">{row.body}</p>
                  <p className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link href={`/admin/feedback/${row.id}`} className="underline">Open</Link>
                    <Link href={pinPath(row.url, row.id)} className="underline">Show pin</Link>
                    {row.fixPrUrl ? <a href={row.fixPrUrl} className="underline">Pull request</a> : null}
                  </p>
                </div>
              </li>
            );
          })}
          {rows.length === 0 ? <li className="text-sm text-ink/60">No feedback matches these filters.</li> : null}
        </ul>
      </form>
    </div>
  );
}
