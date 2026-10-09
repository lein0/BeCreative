export type BrandId = "becreative" | "bewell";

export type Brand = {
  id: BrandId;
  name: string;
  mark: string;
  accent: string;
  vertical: "creative" | "wellness";
  description: string;
  exploreHref: string;
};

export const BECREATIVE: Brand = {
  id: "becreative",
  name: "BeCreative",
  mark: "Creative",
  accent: "clay",
  vertical: "creative",
  description: "Book creative classes with independent teachers across Los Angeles.",
  exploreHref: "/explore",
};

export const BEWELL: Brand = {
  id: "bewell",
  name: "BeWell",
  mark: "Well",
  accent: "moss",
  vertical: "wellness",
  description: "Yoga, bodywork, and bathhouse time with independent practitioners. No health records, just a booking.",
  exploreHref: "/explore?vertical=wellness",
};

export function wellnessHosts() {
  const configured = process.env.BEWELL_HOSTS ?? "bewell.localhost,bewell.test,bewell.com,www.bewell.com";
  return configured.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

/** A future BeWell domain maps to the wellness vertical. Every other host stays BeCreative. */
export function brandForHost(host: string | null | undefined): Brand {
  const name = (host ?? "").split(":")[0].trim().toLowerCase();
  if (!name) return BECREATIVE;
  const hosts = wellnessHosts();
  if (hosts.some((item) => name === item || name.endsWith(`.${item}`))) return BEWELL;
  return BECREATIVE;
}
