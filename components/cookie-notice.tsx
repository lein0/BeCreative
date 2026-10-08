"use client";

import { useEffect, useState } from "react";

export function CookieNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(window.localStorage.getItem("bc_cookie") !== "1");
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper px-5 py-4" role="dialog" aria-label="Cookie notice">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/80">We use a sign-in cookie and a short-lived cookie for promo codes and referral links. No advertising cookies.</p>
        <button
          className="rounded-full bg-ink px-4 py-2 text-sm text-paper"
          onClick={() => {
            window.localStorage.setItem("bc_cookie", "1");
            setOpen(false);
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
