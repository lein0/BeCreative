"use client";

import { useState } from "react";
import { checkoutPreviewQuote } from "@/lib/checkout-rules";
import type { PriceQuote } from "@/lib/pricing";
import { money } from "@/lib/utils";

export function BookingQuote({
  code,
  sessionQuote,
  seriesQuote,
}: {
  code?: string;
  sessionQuote: PriceQuote;
  seriesQuote: PriceQuote | null;
}) {
  const [series, setSeries] = useState(false);
  const quote = checkoutPreviewQuote({ series, session: sessionQuote, seriesQuote });
  return (
    <>
      {code ? (
        <div className="mt-3 space-y-1 text-sm" data-testid="price-breakdown">
          <p className="flex justify-between"><span>Class</span><span>{money(quote.listPriceCents)}</span></p>
          <p className="flex justify-between"><span>Code {code}</span><span>{quote.discountCents ? `−${money(quote.discountCents)}` : quote.codeError || "Not applied"}</span></p>
          <p className="flex justify-between"><span>You pay</span><span>{money(quote.studentPaysCents)}</span></p>
          <p className="text-xs text-ink/50">Platform fee on this booking is {money(quote.platformFeeCents)}{quote.platformLiabilityCents ? ` · promo liability ${money(quote.platformLiabilityCents)}` : ""}.</p>
        </div>
      ) : null}
      {seriesQuote ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="series" value="1" checked={series} onChange={(event) => setSeries(event.target.checked)} />
          Book the whole series ({money(seriesQuote.listPriceCents)})
        </label>
      ) : null}
    </>
  );
}
