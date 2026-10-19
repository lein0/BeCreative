import type { SocialProvider } from "../api/types";

export function friendlySocialError(provider: SocialProvider, status: number, message: string) {
  if (status === 503) {
    const name = provider === "apple" ? "Apple" : "Google";
    return `${message} You can sign in with email until ${name} is configured.`;
  }
  return message;
}
