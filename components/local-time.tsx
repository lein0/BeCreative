"use client";

import { useEffect } from "react";

/** Stores the browser time zone so texts can use the recipient's local clock. */
export function LocalTime() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    void fetch("/api/timezone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone }),
    });
  }, []);
  return null;
}
