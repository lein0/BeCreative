import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/env";
import { LEGAL_PAGES } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  const paths = ["/", "/explore", "/wellness", "/help", "/help/safety", ...LEGAL_PAGES.map((page) => `/legal/${page.slug}`)];
  return paths.map((path) => ({ url: `${origin}${path}`, changeFrequency: "weekly" as const }));
}
