import { Suspense } from "react";
import { ResetForm } from "@/components/auth-forms";
import { Panel } from "@/components/bits";
import { one } from "@/lib/utils";

export default function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = one((await searchParams).token);
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="display text-5xl">Choose a password</h1>
      <Panel className="mt-6">
        {token ? <ResetForm token={token} /> : <p className="text-sm text-clay">This reset link is missing a token. Request a new one.</p>}
      </Panel>
    </div>
  );
}
