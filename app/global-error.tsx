"use client";

import { useEffect } from "react";
import { reportErrorAction } from "@/lib/report-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportErrorAction(error.message || "Request failed", error.digest);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <h1>Something went wrong</h1>
        <p>The error was reported.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
