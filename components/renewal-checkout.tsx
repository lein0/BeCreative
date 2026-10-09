"use client";

import { useState } from "react";
import type { DisclosureView } from "@/lib/renewal-copy";

export function RenewalCheckout({
  action,
  disclosure,
  hidden,
}: {
  action: (formData: FormData) => void;
  disclosure: DisclosureView;
  hidden: Record<string, string>;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={action} className="mt-5 space-y-4">
      {Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input type="hidden" name="disclosureVersion" value={disclosure.version} />
      <section aria-label="Auto-renewal disclosure" className="rounded-2xl border-2 border-ink bg-white p-4 text-base leading-6 text-ink">
        {disclosure.lines.map((item) => (
          <p key={item.segments.map((segment) => segment.text).join("")} className={item.bold ? "mb-3 font-semibold" : "mb-3"}>
            {item.segments.map((segment) => segment.href ? <a key={segment.href} href={segment.href} className="underline">{segment.text}</a> : <span key={segment.text}>{segment.text}</span>)}
          </p>
        ))}
      </section>
      <label className="flex items-start gap-3 text-base font-semibold leading-6 text-ink">
        <input
          type="checkbox"
          name="consent"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span>{disclosure.checkbox}</span>
      </label>
      <p className="text-base text-ink">
        {disclosure.termsLine.split("Terms of Service")[0]}
        <a href={disclosure.termsUrl} className="underline">Terms of Service</a>
        {disclosure.termsLine.split("Terms of Service")[1]?.split("cancellation policy")[0]}
        <a href={disclosure.policyUrl} className="underline">cancellation policy</a>
        {disclosure.termsLine.split("cancellation policy")[1]}
      </p>
      <input name="code" placeholder="Promo code" className="w-full rounded-2xl border border-line px-3 py-2 uppercase" />
      <button disabled={!agreed} className="w-full rounded-full bg-ink px-5 py-3 text-base text-paper disabled:cursor-not-allowed disabled:opacity-40">
        {disclosure.buttonLabel}
      </button>
    </form>
  );
}
