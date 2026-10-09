"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function ReturnInner() {
  const params = useSearchParams();
  const flow = params.get("flow") || "booking";
  const cancelled = params.get("cancelled") === "1";
  const target = `becreative://bookings?flow=${encodeURIComponent(flow)}${cancelled ? "&cancelled=1" : "&paid=1"}`;
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
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
