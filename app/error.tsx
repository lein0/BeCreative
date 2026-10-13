"use client";

import { useEffect } from "react";
import { reportErrorAction } from "@/lib/report-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportErrorAction(error.message || "Request failed", error.digest);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="display text-5xl">Something went wrong</h1>
      <p className="mt-3 text-ink/70">The error was reported. You can try that again.</p>
      <button type="button" onClick={() => reset()} className="mt-6 rounded-full bg-ink px-4 py-2 text-sm text-paper">Try again</button>
    </div>
  );
}
