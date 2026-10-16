import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { googleBrowserClientId } from "./google-client";

export type SocialCredential = {
  idToken: string;
  nonce: string;
  firstName?: string;
  lastName?: string;
};

async function randomNonce() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function googleClientId() {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  return googleBrowserClientId({
    platform,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
}

export async function googleSignIn(): Promise<SocialCredential> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in needs the web client id from Eric's Google Cloud project. You can sign in with email until then.");
  const nonce = await randomNonce();
  const WebBrowser = await import("expo-web-browser");
  const AuthSession = await import("expo-auth-session");
  WebBrowser.maybeCompleteAuthSession();
  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ["openid", "email", "profile"],
    extraParams: { nonce },
  });
  const discovery = { authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth" };
  const result = await request.promptAsync(discovery);
  if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
  const idToken = result.params.id_token;
  if (!idToken) throw new Error("Google did not return an id token.");
  return { idToken, nonce };
}

async function appleWebSignIn(nonce: string, hashed: string): Promise<SocialCredential> {
  const clientId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
  if (!clientId) throw new Error("Sign in with Apple on Android needs the Services ID from Eric's Apple Developer account. You can sign in with email until then.");
  const WebBrowser = await import("expo-web-browser");
  const AuthSession = await import("expo-auth-session");
  WebBrowser.maybeCompleteAuthSession();
  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ["name", "email"],
    extraParams: { nonce: hashed, response_mode: "fragment" },
  });
  const discovery = { authorizationEndpoint: "https://appleid.apple.com/auth/authorize" };
  const result = await request.promptAsync(discovery);
  if (result.type !== "success") throw new Error("Apple sign-in was cancelled.");
  const idToken = result.params.id_token;
  if (!idToken) throw new Error("Apple did not return a token.");
  return { idToken, nonce };
}

export async function appleSignIn(): Promise<SocialCredential> {
  const nonce = await randomNonce();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  if (Platform.OS === "ios") {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) throw new Error("Sign in with Apple is not available on this device. You can sign in with email.");
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) throw new Error("Apple did not return a token.");
    return {
      idToken: credential.identityToken,
      nonce,
      firstName: credential.fullName?.givenName ?? undefined,
      lastName: credential.fullName?.familyName ?? undefined,
    };
  }
  return appleWebSignIn(nonce, hashed);
}
