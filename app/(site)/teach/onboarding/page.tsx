"use client";

import { useActionState } from "react";
import { onboardingAction } from "@/lib/actions";
import { control } from "@/components/bits";

export default function OnboardingPage() {
  const [state, action, pending] = useActionState(onboardingAction, null);
  return (
    <form action={action} className="mx-auto max-w-xl space-y-3">
      <h1 className="display text-5xl">Your studio</h1>
      <p className="text-ink/70">A short profile. An admin approves you before classes go public. You can draft classes while you wait.</p>
      {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
      <input name="studio" required placeholder="Studio name" className={control} />
      <textarea name="bio" required placeholder="Bio" className={`${control} min-h-28`} />
      <input name="specialties" placeholder="Specialties, comma separated" className={control} />
      <input name="instagram" placeholder="Instagram" className={control} />
      <input name="tiktok" placeholder="TikTok" className={control} />
      <input name="youtube" placeholder="YouTube" className={control} />
      <input name="website" placeholder="Website" className={control} />
      <button disabled={pending} className="rounded-full bg-clay px-5 py-3 text-sm text-white">{pending ? "Saving…" : "Submit for approval"}</button>
    </form>
  );
}
