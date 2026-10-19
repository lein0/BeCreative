import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { appOrigin } from "@/lib/env";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
  title: { default: "BeCreative", template: "%s · BeCreative" },
  description: "Book creative classes with independent teachers across Los Angeles.",
  openGraph: { siteName: "BeCreative", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen text-ink antialiased">{children}</body>
    </html>
  );
}
