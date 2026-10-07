import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { Panel } from "@/components/bits";
import { googleAuthConfigured } from "@/lib/env";
import { one } from "@/lib/utils";

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = one((await searchParams).next) || "/explore";
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="display text-5xl">Welcome back</h1>
      <Panel className="mt-6">
        <LoginForm next={next} google={googleAuthConfigured()} />
      </Panel>
      <p className="mt-4 text-xs text-ink/50">Demo: teacher@becreative.demo, student@becreative.demo, admin@becreative.demo, manager@becreative.demo · DemoPass123!</p>
    </div>
  );
}
