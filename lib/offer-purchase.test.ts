import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { quotePrice } from "@/lib/pricing";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => createElement("a", { href, className }, children),
}));

const { OfferPurchase } = await import("@/components/offer-purchase");
const { BookingQuote } = await import("@/components/booking-quote");

describe("offer checkout", () => {
  it("shows the checkout error and sends a guest back to the offer after sign-in", () => {
    const html = renderToStaticMarkup(createElement(OfferPurchase, {
      error: "That code is not active.",
      signedIn: false,
      back: "/t/maya/p/five",
      kind: "pack",
      offerId: "pack-1",
      action: async () => undefined,
      label: "Buy pack",
    }));
    expect(html).toContain("That code is not active.");
    expect(html).toContain('href="/login?next=%2Ft%2Fmaya%2Fp%2Ffive"');
    expect(html).toContain("Sign in to buy");
    expect(html).toContain("disabled");
  });
});

describe("series promo preview", () => {
  it("starts from the session price and follows the series checkbox", () => {
    const session = quotePrice({ listPriceCents: 2500, feePercent: 10, feeFixedCents: 0 });
    const series = quotePrice({ listPriceCents: 8000, feePercent: 10, feeFixedCents: 0 });
    const html = renderToStaticMarkup(createElement(BookingQuote, { code: "SAVE", sessionQuote: session, seriesQuote: series }));
    expect(html).toContain("$25.00");
    expect(html).toContain("$80.00");
    expect(html).toContain('name="series"');
    const source = readFileSync("components/booking-quote.tsx", "utf8");
    expect(source).toContain("checkoutPreviewQuote({ series, session: sessionQuote, seriesQuote })");
    expect(source).toContain("setSeries(event.target.checked)");
  });
});
