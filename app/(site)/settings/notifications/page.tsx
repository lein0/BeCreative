import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notificationPrefAction } from "@/lib/actions";
import { saveContactPrefsAction } from "@/lib/trigger-actions";
import { smsOnByDefault } from "@/lib/messaging-rules";
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
      <p className="mt-2 max-w-xl text-sm text-ink/70">Booking email and the in-app bell are on. Texts default to a 2-hour reminder, a same-day cancellation, and a waitlist spot, and only after you opt in. They wait out quiet hours (9pm–8am Pacific). Marketing notes are a separate checkbox.</p>
      <form action={saveContactPrefsAction} className="mt-4 space-y-3 rounded-3xl bg-white p-4 ring-1 ring-line">
        <input name="phone" type="tel" defaultValue={person?.phone ?? ""} placeholder="Mobile phone" className={control} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="smsOptIn" value="1" defaultChecked={Boolean(person?.smsOptIn)} className="mt-1" />
          <span>I agree to class texts. Reply STOP to opt out. Msg & data rates may apply. <Link className="underline" href="/legal/sms">SMS terms</Link></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="marketingOptIn" value="1" defaultChecked={Boolean(person?.marketingOptIn)} className="mt-1" />
          <span>Send occasional class ideas. This does not change booking emails.</span>
        </label>
        <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save contact</button>
      </form>
      <form action={notificationPrefAction} className="mt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="creditOptIn" value="1" defaultChecked={person?.creditOptIn} />
          If a teacher cancels, I will take studio credit instead of a refund
        </label>
      </form>
      <div className="mt-6 space-y-4">
        {events.map((event) => {
          const pref = prefs.find((row) => row.event === event);
          return (
            <form key={event} action={notificationPrefAction} className="rounded-3xl bg-white p-4 ring-1 ring-line">
              <input type="hidden" name="event" value={event} />
              <input type="hidden" name="creditOptIn" value={person?.creditOptIn ? "1" : "0"} />
              <p className="font-medium">{event}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" name="email" value="1" defaultChecked={pref?.email ?? true} /> Email</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="inApp" value="1" defaultChecked={pref?.inApp ?? true} /> In app</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="sms" value="1" defaultChecked={pref ? pref.sms : smsOnByDefault(event, event === "booking.reminder" || event === "booking.cancelled")} /> Text</label>
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
