import { headers } from "next/headers";
import { Suspense } from "react";
import { SiteFrame } from "@/components/shell";
import { BECREATIVE, brandForHost } from "@/lib/brand";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<SiteFrame brand={BECREATIVE}>{children}</SiteFrame>}>
      <BrandedSite>{children}</BrandedSite>
    </Suspense>
  );
}

async function BrandedSite({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  return <SiteFrame brand={brandForHost(host)}>{children}</SiteFrame>;
}
