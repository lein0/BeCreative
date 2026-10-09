import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notificationPrefAction } from "@/lib/actions";
import { control } from "@/components/bits";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { notificationPreferences, user } from "@/lib/db/schema";
import { STUDENT_EVENTS, TEACHER_EVENTS } from "@/lib/ship-defaults";

export default function NotificationSettingsPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading settings…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const actor = await requireActor();
  const [person] = await db.select().from(user).where(eq(user.id, actor.id)).limit(1);
  const prefs = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actor.id));
  const teacher = actor.roles.includes("teacher");
  const events = teacher ? [...TEACHER_EVENTS] : [...STUDENT_EVENTS];
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="display text-5xl">Notification settings</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/70">Email and the in-app bell are on. Text messages stay off until you turn them on, and they wait until after quiet hours (9pm–8am Pacific).</p>
      <form action={notificationPrefAction} className="mt-4">
        <input type="hidden" name="saveCredit" value="1" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="creditOptIn" value="1" defaultChecked={person?.creditOptIn} />
          If a teacher cancels, I will take studio credit instead of a refund
        </label>
        <button className="mt-3 rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save</button>
      </form>
      <div className="mt-6 space-y-4">
        {events.map((event) => {
          const pref = prefs.find((row) => row.event === event);
          return (
            <form key={event} action={notificationPrefAction} className="rounded-3xl bg-white p-4 ring-1 ring-line">
              <input type="hidden" name="event" value={event} />
              <p className="font-medium">{event}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" name="email" value="1" defaultChecked={pref?.email ?? true} /> Email</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="inApp" value="1" defaultChecked={pref?.inApp ?? true} /> In app</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="sms" value="1" defaultChecked={pref?.sms ?? false} /> Text</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="push" value="1" defaultChecked={pref?.push ?? false} /> Push</label>
                {teacher ? (
                  <select name="cadence" defaultValue={pref?.cadence ?? "instant"} className={control}>
                    <option value="instant">Instant</option>
                    <option value="daily">Daily digest</option>
                  </select>
                ) : <input type="hidden" name="cadence" value="instant" />}
              </div>
              <button className="mt-3 rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save</button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
