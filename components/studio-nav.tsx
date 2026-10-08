import Link from "next/link";

export function StudioNav({ base = "/teach" }: { base?: string }) {
  const links = [
    ["Studio", base],
    ["New class", `${base}/classes/new`],
    ["New visit", `${base}/services/new`],
    ["Waiver", `${base}/waiver`],
    ["Credentials", `${base}/credentials`],
    ["Pricing", `${base}/pricing`],
    ["Promos", `${base}/promos`],
    ["Reports", `${base}/reports`],
    ["Billing", `${base}/billing`],
    ["Messages", `${base}/messages`],
  ];
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {links.map(([label, href]) => (
        <Link key={href} href={href} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">
          {label}
        </Link>
      ))}
    </nav>
  );
}
