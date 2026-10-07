"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotAction, loginAction, signupAction } from "@/lib/actions";
import { control } from "@/components/bits";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      <input name="email" type="email" required placeholder="Email" className={control} />
      <input name="password" type="password" required placeholder="Password" className={control} />
      <button disabled={pending} className="w-full rounded-full bg-ink py-3 text-paper">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-ink/60">
        <Link href="/forgot" className="underline">Forgot password</Link>
        {" · "}
        <Link href="/signup" className="underline">Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      <input name="name" required placeholder="Name" className={control} />
      <input name="email" type="email" required placeholder="Email" className={control} />
      <input name="password" type="password" required minLength={8} placeholder="Password" className={control} />
      <button disabled={pending} className="w-full rounded-full bg-clay py-3 text-white">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-moss">{state.ok}</p> : null}
      <input name="email" type="email" required placeholder="Email" className={control} />
      <button disabled={pending} className="w-full rounded-full bg-ink py-3 text-paper">
        Send reset link
      </button>
    </form>
  );
}
