"use client";

import { useMemo, useState } from "react";

type Promo = { code: string };

export function ShareButton({
  path,
  title,
  eyebrow,
  priceLabel,
  when,
  imageUrl,
  promos = [],
}: {
  path: string;
  title: string;
  eyebrow?: string;
  priceLabel?: string;
  when?: string;
  imageUrl?: string | null;
  promos?: Promo[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(promos[0]?.code ?? "");
  const [copied, setCopied] = useState("");
  const [includeCode, setIncludeCode] = useState(false);

  const url = useMemo(() => {
    if (typeof window === "undefined") return path;
    const next = new URL(path, window.location.origin);
    if (includeCode && code) next.searchParams.set("code", code.toUpperCase());
    if (!next.searchParams.get("ref")) next.searchParams.set("ref", "share");
    return next.toString();
  }, [path, includeCode, code]);

  const qrUrl = useMemo(() => {
    const next = new URL(path, typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
    if (includeCode && code) next.searchParams.set("code", code.toUpperCase());
    next.searchParams.set("ref", "qr");
    return `/api/qr?text=${encodeURIComponent(next.toString())}`;
  }, [path, includeCode, code]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  async function nativeShare() {
    const shared = new URL(url);
    shared.searchParams.set("ref", "native");
    if (navigator.share) {
      await navigator.share({ title, text: `${title} on BeCreative`, url: shared.toString() });
      return;
    }
    await copy(shared.toString(), "link");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-sand">
        Share
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center" role="dialog" aria-label="Share">
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-[28px] bg-paper p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-ink/50">Share link</p>
                <h2 className="display text-3xl leading-none">{title}</h2>
              </div>
              <button type="button" className="rounded-full px-3 py-1 text-sm hover:bg-sand" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <article className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="link-preview">
              <div className="aspect-[1.91/1] bg-moss">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-end bg-gradient-to-br from-clay to-moss p-4 text-white">
                    <span className="display text-4xl leading-none">{title}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink/45">{eyebrow ?? "BeCreative"}</p>
                <p className="display text-2xl leading-tight">{title}</p>
                <p className="text-sm text-ink/70">
                  {[priceLabel, when].filter(Boolean).join(" · ") || "Book a class"}
                </p>
              </div>
            </article>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeCode} onChange={(event) => setIncludeCode(event.target.checked)} />
              Bake in a promo code
            </label>
            {includeCode ? (
              <input
                className="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 uppercase"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="XYZ"
                list="promo-codes"
              />
            ) : null}
            <datalist id="promo-codes">
              {promos.map((promo) => (
                <option key={promo.code} value={promo.code} />
              ))}
            </datalist>
            <p className="mt-3 break-all rounded-2xl bg-sand px-3 py-2 text-xs text-ink/80">{url}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-full bg-ink px-4 py-2 text-sm text-paper" onClick={() => copy(url, "link")}>
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
              <button type="button" className="rounded-full border border-line bg-white px-4 py-2 text-sm" onClick={nativeShare}>
                Share sheet
              </button>
              <a className="rounded-full border border-line bg-white px-4 py-2 text-sm" href={qrUrl} download="becreative-qr.png">
                Download QR
              </a>
            </div>
            <img src={qrUrl} alt="QR code for this link" className="mt-4 h-36 w-36 rounded-2xl border border-line bg-white p-2" />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function EmbedSnippet({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const snippet =
    typeof window === "undefined"
      ? ""
      : `<iframe src="${window.location.origin}/embed/${slug}" title="Book with me" style="width:100%;max-width:420px;height:640px;border:0;border-radius:24px"></iframe>`;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Book with me button</p>
      <textarea readOnly className="h-24 w-full rounded-2xl border border-line bg-white p-3 text-xs" value={snippet} />
      <button
        type="button"
        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(snippet);
          setCopied(true);
        }}
      >
        {copied ? "Copied snippet" : "Copy embed snippet"}
      </button>
    </div>
  );
}
