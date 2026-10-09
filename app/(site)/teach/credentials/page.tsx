import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { control, Panel } from "@/components/bits";
import { saveCredentialAction } from "@/lib/actions";
import { requireActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { credentials } from "@/lib/db/schema";
import { teacherByUser } from "@/lib/queries";
import { one } from "@/lib/utils";

export default function CredentialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p>Loading credentials…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const rows = await db.select().from(credentials).where(eq(credentials.teacherId, teacher.id));
  const error = one((await searchParams).error);
  return (
    <div className="max-w-xl">
      <h1 className="display text-5xl">Credentials</h1>
      <p className="mt-2 text-sm text-ink/70">Optional. A license or certificate shows as a badge. An admin can mark it verified.</p>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <Panel key={row.id}>{row.label}{row.identifier ? ` · ${row.identifier}` : ""}{row.verified ? " · verified" : " · pending review"}</Panel>
        ))}
      </div>
      <form action={saveCredentialAction} className="mt-6 space-y-3">
        <input name="label" required className={control} placeholder="RYT-200 or CAMTC" />
        <input name="identifier" className={control} placeholder="License number, optional" />
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-paper">Add credential</button>
      </form>
    </div>
  );
}
