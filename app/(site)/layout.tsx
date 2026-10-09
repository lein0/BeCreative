import { headers } from "next/headers";
import { Suspense } from "react";
import { SiteFrame } from "@/components/shell";
import { brandForHost } from "@/lib/brand";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<header className="h-16 border-b border-line bg-paper/80" />}>
      <BrandedSite>{children}</BrandedSite>
    </Suspense>
  );
}

async function BrandedSite({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  return <SiteFrame brand={brandForHost(host)}>{children}</SiteFrame>;
}
