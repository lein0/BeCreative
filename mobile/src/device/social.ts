import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

export async function googleSignInToken(): Promise<string> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!clientId) throw new Error("Google sign-in needs a client id from Eric's Google Cloud project.");
  const WebBrowser = await import("expo-web-browser");
  const AuthSession = await import("expo-auth-session");
  WebBrowser.maybeCompleteAuthSession();
  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ["openid", "email", "profile"],
  });
  const discovery = { authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth" };
  const result = await request.promptAsync(discovery);
  if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
  const idToken = result.params.id_token;
  if (!idToken) throw new Error("Google did not return an id token.");
  return idToken;
}

export async function appleSignIn(): Promise<{ idToken: string; nonce: string; fullName: { givenName?: string | null; familyName?: string | null } | null }> {
  const nonce = Math.random().toString(36).slice(2);
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  if (Platform.OS === "ios") {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) throw new Error("Sign in with Apple is not available on this device.");
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) throw new Error("Apple did not return a token.");
    return {
      idToken: credential.identityToken,
      nonce,
      fullName: credential.fullName ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName } : null,
    };
  }
  throw new Error("On Android, Sign in with Apple uses the Services ID configured for the web flow. Add EXPO_PUBLIC_APPLE_SERVICE_ID before release.");
}
