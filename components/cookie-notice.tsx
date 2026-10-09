"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_COOKIE, MARKETING_COOKIE, gpcEnabled, privacyChoices } from "@/lib/privacy";

function browserGpc() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return gpcEnabled(nav.globalPrivacyControl);
}

function writeCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function CookieNotice() {
  const [open, setOpen] = useState(false);
  const [gpc, setGpc] = useState(false);
  useEffect(() => {
    const signal = browserGpc();
    const accepted = window.localStorage.getItem(ANALYTICS_COOKIE) === "1";
    const choices = privacyChoices({ gpc: signal, accepted });
    const id = window.setTimeout(() => {
      setGpc(signal);
      if (signal) {
        window.localStorage.removeItem(ANALYTICS_COOKIE);
        writeCookie(ANALYTICS_COOKIE, "", 0);
        writeCookie(MARKETING_COOKIE, "", 0);
      }
      setOpen(signal || !choices.analytics);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper px-5 py-4" role="dialog" aria-label="Cookie notice">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/80">
          {gpc
            ? "Your browser sent Global Privacy Control, so analytics and marketing cookies stay off."
            : "We use a sign-in cookie and a short-lived cookie for promo codes and referral links. No advertising cookies."}
        </p>
        {gpc ? null : (
          <button
            className="rounded-full bg-ink px-4 py-2 text-sm text-paper"
            onClick={() => {
              if (browserGpc()) return;
              window.localStorage.setItem(ANALYTICS_COOKIE, "1");
              writeCookie(ANALYTICS_COOKIE, "1", 60 * 60 * 24 * 365);
              setOpen(false);
            }}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}
