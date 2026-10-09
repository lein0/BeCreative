import { SiteFrame } from "@/components/shell";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
