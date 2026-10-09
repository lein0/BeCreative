export const ANON_COOKIE = "bc_anon";
export const ANON_HEADER = "x-bc-anon";

/** Mint one anonymous id for a first visit and expose it on the forwarded request. */
export function bindAnonymousId(headers: Headers, existing: string | undefined) {
  if (existing) return { id: existing, minted: false as const };
  const id = crypto.randomUUID();
  headers.set(ANON_HEADER, id);
  return { id, minted: true as const };
}

/** Cookie, then the id minted for this request, then the signed-in user. */
export function experimentSubject(input: { cookie?: string | null; header?: string | null; userId?: string | null }) {
  const cookie = input.cookie?.trim();
  if (cookie) return cookie;
  const header = input.header?.trim();
  if (header) return header;
  return input.userId || "anonymous";
}
