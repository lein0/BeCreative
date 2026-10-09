import { headers } from "next/headers";
import { gpcEnabled } from "@/lib/privacy";

export async function marketingCookiesAllowed() {
  try {
    return !gpcEnabled((await headers()).get("sec-gpc"));
  } catch {
    return true;
  }
}
