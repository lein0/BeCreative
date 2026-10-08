import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { headers } from "next/headers";
import { brandForHost } from "@/lib/brand";
import { appOrigin } from "@/lib/env";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  const brand = brandForHost(host);
  return {
    metadataBase: new URL(appOrigin()),
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: brand.description,
    openGraph: { siteName: brand.name, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  const brand = brandForHost(host);
  return (
    <html lang="en" data-brand={brand.id} className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen text-ink antialiased">{children}</body>
    </html>
  );
}
