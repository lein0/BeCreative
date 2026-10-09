import { db } from "@/lib/db";
import { triggerOverrides } from "@/lib/db/schema";
import { sendTriggerTestAction, toggleTriggerAction } from "@/lib/trigger-actions";
import { TRIGGERS } from "@/lib/triggers";

export default async function TriggersPage() {
  const rows = await db.select().from(triggerOverrides);
  const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.id));
  return (
    <div>
      <h1 className="display text-5xl">Email triggers</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Every note the product can send. Turn one off to stop it. A test goes to the email on your admin account. Texts still follow opt-in, quiet hours, and the monthly cap.</p>
      <div className="mt-6 space-y-3">
        {TRIGGERS.map((trigger) => {
          const off = disabled.has(trigger.id);
          return (
            <article key={trigger.id} className="rounded-3xl bg-white p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{trigger.id}</h2>
                <p className="text-xs uppercase tracking-wide text-ink/50">{off ? "Off" : "On"}</p>
              </div>
              <p className="mt-1 text-sm text-ink/70">{trigger.description}</p>
              <p className="mt-1 text-xs text-ink/50">{trigger.channels.join(" · ")} · {trigger.consent}{trigger.delayMinutes ? ` · waits ${trigger.delayMinutes} minutes` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={toggleTriggerAction}>
                  <input type="hidden" name="id" value={trigger.id} />
                  <input type="hidden" name="enabled" value={off ? "1" : "0"} />
                  <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">{off ? "Turn on" : "Turn off"}</button>
                </form>
                <form action={sendTriggerTestAction}>
                  <input type="hidden" name="id" value={trigger.id} />
                  <button className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line">Send test to me</button>
                </form>
                <a className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line" href={`/email/preview/${encodeURIComponent(trigger.template)}`}>Preview</a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
