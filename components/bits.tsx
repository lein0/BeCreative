import Link from "next/link";
import { FORMAT_LABELS, LEVEL_LABELS, type ClassFormat, type SkillLevel } from "@/lib/constants";
import { money, priceLabel } from "@/lib/utils";

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-mist p-5 shadow-[0_1px_0_rgba(28,23,20,0.04)] ${className}`}>{children}</section>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink/80">{label}</span>
      {children}
    </label>
  );
}

export const control =
  "w-full rounded-2xl border border-line bg-white px-3 py-2.5 text-ink outline-none ring-clay/30 placeholder:text-ink/35 focus:ring-2";

export function Button({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "clay" | "ghost" }) {
  const tones = {
    ink: "bg-ink text-paper hover:bg-moss",
    clay: "bg-clay text-white hover:bg-[#c44c14]",
    ghost: "border border-line bg-white text-ink hover:bg-sand",
  };
  return <button className={`rounded-full px-4 py-2.5 text-sm font-medium ${tones[tone]}`}>{children}</button>;
}

export function Cover({ src, title, hue = 18 }: { src?: string | null; title: string; hue?: number }) {
  if (src) return <img src={src} alt="" className="h-full w-full object-cover" />;
  return (
    <div className="flex h-full w-full items-end p-4 text-white" style={{ background: `linear-gradient(145deg, hsl(${hue} 62% 42%), hsl(${(hue + 40) % 360} 30% 18%))` }}>
      <span className="display text-2xl leading-none">{title}</span>
    </div>
  );
}

export function ClassCard({
  href,
  title,
  teacher,
  cover,
  price,
  meta,
  hue,
}: {
  href: string;
  title: string;
  teacher: string;
  cover?: string | null;
  price: string;
  meta: string;
  hue?: number;
}) {
  return (
    <Link href={href} className="group overflow-hidden rounded-3xl border border-line bg-mist">
      <div className="aspect-[4/3] overflow-hidden bg-sand">
        <div className="h-full transition duration-300 group-hover:scale-[1.03]">
          <Cover src={cover} title={title} hue={hue} />
        </div>
      </div>
      <div className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{teacher}</p>
        <h3 className="display text-2xl leading-tight">{title}</h3>
        <p className="flex items-center justify-between text-sm text-ink/70">
          <span>{meta}</span>
          <span className="font-medium text-ink">{price}</span>
        </p>
      </div>
    </Link>
  );
}

export function levelLabel(value: string) {
  return LEVEL_LABELS[value as SkillLevel] ?? value;
}

export function formatLabel(value: string) {
  return FORMAT_LABELS[value as ClassFormat] ?? value;
}

export function Money({ cents }: { cents: number }) {
  return <span>{money(cents)}</span>;
}

export function fromPrice(session: number | null | undefined, series: number | null | undefined) {
  return priceLabel(session, series);
}
