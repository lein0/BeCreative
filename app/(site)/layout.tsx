import { headers } from "next/headers";
import { SiteFrame } from "@/components/shell";
import { brandForHost } from "@/lib/brand";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  return <SiteFrame brand={brandForHost(host)}>{children}</SiteFrame>;
}
