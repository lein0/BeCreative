import Link from "next/link";
import { Bell } from "lucide-react";
import { Suspense } from "react";
import { CookieNotice } from "@/components/cookie-notice";
import { FeedbackLaunchButton } from "@/components/feedback-widget";
import { FeedbackSlot } from "@/components/feedback-slot";
import { getActor } from "@/lib/actor";
import { BECREATIVE, type Brand } from "@/lib/brand";
import { authorUnreadCount } from "@/lib/feedback-service";
import { feedbackRole } from "@/lib/feedback-rules";
import { unreadCount } from "@/lib/notifications";
import { canManageLeads, canViewPlatformStats } from "@/lib/permissions";

export function SiteFrame({ children, brand = BECREATIVE }: { children: React.ReactNode; brand?: Brand }) {
  return (
    <>
      <Suspense fallback={<header className="h-16 border-b border-line bg-paper/80" />}>
        <SiteHeader brand={brand} />
      </Suspense>
      <main>{children}</main>
      <footer className="mx-auto mt-16 flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-ink/60">
        <p>{brand.name} · independent teachers, direct bookings.</p>
        <nav className="flex flex-wrap gap-3">
          <Link href="/help">Help</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/settings/privacy">Your data</Link>
        </nav>
      </footer>
      <CookieNotice />
      <FeedbackSlot />
    </>
  );
}

async function SiteHeader({ brand }: { brand: Brand }) {
  const actor = await getActor();
  const teacher = actor?.roles.includes("teacher");
  const admin = actor ? canViewPlatformStats(actor.roles) : false;
  const crm = actor ? canManageLeads(actor.roles) : false;
  const manage = actor?.roles.includes("account_manager") || admin;
  const feedback = actor ? feedbackRole(actor.roles) : null;
  const feedbackUnread = actor && feedback ? await authorUnreadCount(actor.id) : 0;
  const alerts = actor ? await unreadCount(actor.id) : 0;
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href={brand.id === "bewell" ? "/wellness" : "/"} className="display text-2xl tracking-tight">
          Be<span className="text-clay">{brand.mark}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Nav href={brand.exploreHref}>Explore</Nav>
          {brand.id === "becreative" ? <Nav href="/wellness">Wellness</Nav> : null}
          {teacher ? <Nav href="/teach">Studio</Nav> : null}
          {manage ? <Nav href="/manage">Studios</Nav> : null}
          {crm ? <Nav href="/crm">Leads</Nav> : null}
          {admin ? <Nav href="/admin">Admin</Nav> : null}
          {actor ? <Nav href="/bookings">Bookings</Nav> : null}
          {actor ? (
            <Link href="/notifications" aria-label={alerts ? `${alerts} unread notifications` : "Notifications"} className="relative rounded-full px-3 py-1.5 text-ink/80 hover:bg-sand hover:text-ink">
              <Bell className="h-4 w-4" aria-hidden />
              {alerts ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-clay px-1 text-center text-[10px] leading-4 text-white">{alerts}</span> : null}
            </Link>
          ) : null}
          {feedback ? <FeedbackLaunchButton unread={feedbackUnread} /> : null}
          {actor ? (
            <span className="ml-2 hidden text-ink/70 sm:inline">{actor.name.split(" ")[0]}</span>
          ) : (
            <Link href="/login" className="ml-2 rounded-full bg-ink px-3 py-1.5 text-paper">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Nav({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full px-3 py-1.5 text-ink/80 hover:bg-sand hover:text-ink">
      {children}
    </Link>
  );
}
