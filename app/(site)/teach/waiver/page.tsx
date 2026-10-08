import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { control } from "@/components/bits";
import { saveWaiverAction } from "@/lib/actions";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { waivers } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";
import { one } from "@/lib/utils";

const starter = `This is a liability waiver for a wellness visit. It is not medical care, a diagnosis, or a treatment plan, and it does not ask for health history.

I choose to take part in movement, bodywork, or bathing at my own pace. I will stop if something does not feel right. I accept the ordinary risks of these activities and release the studio from liability for those ordinary risks.`;

export default function WaiverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p>Loading the waiver…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const [waiver] = await db.select().from(waivers).where(eq(waivers.teacherId, teacher.id)).limit(1);
  const sp = await searchParams;
  return (
    <div className="max-w-2xl">
      <h1 className="display text-5xl">Liability waiver</h1>
      <p className="mt-2 text-sm text-ink/70">Students sign the current version once. Saving a new draft bumps the version and asks them to sign again. Keep it non-medical.</p>
      {one(sp.error) ? <p className="mt-3 text-sm text-clay">{one(sp.error)}</p> : null}
      {one(sp.saved) ? <p className="mt-3 text-sm">Saved as version {waiver?.version ?? 1}.</p> : null}
      <form action={saveWaiverAction} className="mt-6 space-y-3">
        <textarea name="body" className={control} rows={12} defaultValue={waiver?.body ?? starter} />
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-paper">Save waiver</button>
      </form>
    </div>
  );
}
