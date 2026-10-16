"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { mobileReturnTarget } from "@/lib/mobile-client";

function ReturnInner() {
  const params = useSearchParams();
  const flow = params.get("flow") || "booking";
  const cancelled = params.get("cancelled") === "1";
  const web = params.get("web") === "1";
  const target = mobileReturnTarget({ flow, cancelled, web });
  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
  if (!target) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-serif text-3xl">{cancelled ? "Checkout cancelled" : "Payment updated"}</h1>
        <p className="mt-3 text-ink/80">You can close this page and return to BeCreative.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-3xl">Returning to BeCreative</h1>
      <p className="mt-3 text-ink/80">If the app does not open, use the link below.</p>
      <a className="mt-6 inline-block underline" href={target}>
        Open the app
      </a>
    </main>
  );
}

export default function MobileReturnPage() {
  return (
    <Suspense fallback={<main className="px-6 py-16">Returning to BeCreative…</main>}>
      <ReturnInner />
    </Suspense>
  );
}
