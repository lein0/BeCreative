import { nativeIntentPath } from "../../lib/mobile-client";

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  return nativeIntentPath(path, initial);
}
