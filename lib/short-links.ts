import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shortLinks } from "@/lib/db/schema";
import { appOrigin } from "@/lib/env";

export async function shortenLink(url: string) {
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await db.insert(shortLinks).values({ code, url });
  const domain = (process.env.SHORT_LINK_DOMAIN || appOrigin()).replace(/\/$/, "");
  return `${domain}/go/${code}`;
}

export async function expandLink(code: string) {
  const [row] = await db.select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1);
  return row?.url ?? null;
}
