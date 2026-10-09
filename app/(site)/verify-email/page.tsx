import { desc } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10">Looking for your email…</p>}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const [latest] = await db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(1);
  const link = latest?.textBody.match(/https?:\/\/\S+/)?.[0];
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <h1 className="display text-5xl">Check your email</h1>
      <p className="mt-3 text-ink/70">Confirm the address to finish signing up. In local development the message lands in the outbox.</p>
      {link && process.env.NODE_ENV !== "production" ? (
        <a className="mt-6 block break-all rounded-2xl bg-white p-4 text-sm text-clay ring-1 ring-line" href={link}>{link}</a>
      ) : null}
    </div>
  );
}
