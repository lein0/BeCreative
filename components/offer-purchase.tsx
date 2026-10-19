import Link from "next/link";
import { loginNextPath } from "@/lib/checkout-rules";

export function OfferPurchase({
  error,
  signedIn,
  back,
  kind,
  offerId,
  action,
  label,
  tone = "clay",
}: {
  error?: string;
  signedIn: boolean;
  back: string;
  kind: "pack" | "membership";
  offerId: string;
  action: (formData: FormData) => Promise<void>;
  label: string;
  tone?: "clay" | "ink";
}) {
  return (
    <>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      <form action={action} className="mt-5 space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={offerId} />
        <input type="hidden" name="back" value={back} />
        <input name="code" placeholder="Promo code" className="w-full rounded-2xl border border-line px-3 py-2 uppercase" />
        <button className={tone === "ink" ? "rounded-full bg-ink px-5 py-3 text-sm text-paper disabled:opacity-60" : "rounded-full bg-clay px-5 py-3 text-sm text-white disabled:opacity-60"} disabled={!signedIn}>
          {signedIn ? label : "Sign in to buy"}
        </button>
      </form>
      {!signedIn ? <Link href={loginNextPath(back)} className="mt-3 block text-sm text-clay">Sign in</Link> : null}
    </>
  );
}
