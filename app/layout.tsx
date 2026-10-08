import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen text-ink antialiased">
        <Suspense fallback={null}>
          <HostBrand />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

async function HostBrand() {
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  const brand = brandForHost(host);
  if (brand.id !== "bewell") return null;
  return (
    <style href="host-brand" precedence="default">{`
      html {
        --color-paper: #f3f7f4;
        --color-ink: #17241f;
        --color-clay: #2f6b5a;
        --color-moss: #1c3d34;
        --color-sand: #e4eee8;
        --color-line: #c9ddd2;
        --color-mist: #f8fbf9;
      }
      body {
        background: radial-gradient(1200px 500px at 100% -10%, rgb(47 107 90 / 0.16), transparent 50%), var(--color-paper);
      }
    `}</style>
  );
}
