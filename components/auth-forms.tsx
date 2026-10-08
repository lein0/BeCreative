"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";
import { forgotAction, loginAction, resetPasswordAction, signupAction } from "@/lib/actions";
import { control } from "@/components/bits";

const authClient = createAuthClient();

export function LoginForm({ next, google }: { next: string; google?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      {google ? <GoogleButton next={next} /> : null}
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

export function SignupForm({ google }: { google?: boolean }) {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      {google ? <GoogleButton next="/explore" /> : null}
      <input name="name" required placeholder="Name" className={control} />
      <input name="email" type="email" required placeholder="Email" className={control} />
      <input name="password" type="password" required minLength={8} placeholder="Password" className={control} />
      <input name="phone" type="tel" placeholder="Mobile phone (optional)" className={control} />
      <label className="flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" name="smsOptIn" value="1" className="mt-1" />
        <span>Text me class reminders. Frequency varies. Reply STOP to opt out. Msg & data rates may apply. <Link href="/legal/sms" className="underline">SMS terms</Link></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" name="marketingOptIn" value="1" className="mt-1" />
        <span>Email me occasional notes about classes I might like. This is separate from booking emails.</span>
      </label>
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

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      <input name="password" type="password" required minLength={8} placeholder="New password" className={control} />
      <input name="confirm" type="password" required minLength={8} placeholder="Confirm password" className={control} />
      <button disabled={pending} className="w-full rounded-full bg-ink py-3 text-paper">
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

function GoogleButton({ next }: { next: string }) {
  return (
    <button
      type="button"
      className="w-full rounded-full border border-line bg-white py-3 text-sm"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
    >
      Continue with Google
    </button>
  );
}
