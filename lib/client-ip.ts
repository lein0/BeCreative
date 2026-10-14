import { trustedProxyCidrs } from "@/lib/env";

function ipv4Match(ip: string, cidr: string) {
  const [range, prefixRaw] = cidr.split("/");
  const ipParts = ip.split(".").map(Number);
  const rangeParts = (range ?? "").split(".").map(Number);
  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if ([...ipParts, ...rangeParts].some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const bits = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipParts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
  const rangeInt = rangeParts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function isIp(hop: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hop)) return hop.split(".").every((part) => Number(part) <= 255);
  return hop.includes(":") && /^[0-9a-f:]+$/i.test(hop);
}

function isTrustedHop(hop: string, cidrs: string[]) {
  if (hop.toLowerCase() === "::1") return cidrs.some((cidr) => cidr === "::1" || cidr.startsWith("::1/"));
  return cidrs.some((cidr) => ipv4Match(hop, cidr));
}

/** Rightmost untrusted hop. A client can prepend addresses, not replace the proxy's. */
export function clientAddress(forwardedFor: string | null | undefined, trusted = trustedProxyCidrs()) {
  const hops = (forwardedFor ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!hops.length) return null;
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index]!;
    if (!isIp(hop)) return null;
    if (isTrustedHop(hop, trusted)) continue;
    return hop;
  }
  return null;
}

/** Stable rate-limit address. Rotating a spoofed or invalid header stays in one bucket. */
export function rateLimitAddress(headers: { get(name: string): string | null }) {
  return clientAddress(headers.get("x-forwarded-for")) ?? clientAddress(headers.get("x-real-ip")) ?? "unknown";
}
