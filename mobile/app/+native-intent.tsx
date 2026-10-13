import { systemPathForIncomingUrl } from "../../lib/mobile-client";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return systemPathForIncomingUrl(path);
  } catch {
    return initial ? "/explore" : path;
  }
}
