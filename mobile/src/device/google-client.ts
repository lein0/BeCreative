export type GoogleClientEnv = {
  platform: "ios" | "android" | "web";
  web?: string | null;
  ios?: string | null;
  android?: string | null;
};

/**
 * Google sign-in uses a browser redirect (`makeRedirectUri`). Only a Web
 * application OAuth client accepts that redirect. iOS and Android client ids
 * are for the native SDKs and reject it.
 */
export function googleBrowserClientId(input: GoogleClientEnv): string | null {
  const web = input.web?.trim();
  return web || null;
}
