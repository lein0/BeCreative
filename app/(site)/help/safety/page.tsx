import { Suspense } from "react";
import { ticketAction } from "@/lib/support-actions";
import { control } from "@/components/bits";

export default function SafetyPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const query = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="display text-5xl">Report a problem</h1>
      <p className="mt-2 text-sm text-ink/70">Safety concerns go straight to the BeCreative team. They do not wait on the teacher.</p>
      {query.sent ? <p className="mt-3 text-sm">Received. An admin has this.</p> : null}
      <form action={ticketAction} className="mt-4 space-y-3">
        <input type="hidden" name="category" value="safety" />
        <label className="block text-sm">Subject<input name="subject" required className={`${control} mt-1`} /></label>
        <label className="block text-sm">What happened<textarea name="body" required className={`${control} mt-1 min-h-32`} /></label>
        <button className="rounded-full bg-clay px-4 py-2 text-sm text-white">Send to admin</button>
      </form>
    </div>
  );
}
