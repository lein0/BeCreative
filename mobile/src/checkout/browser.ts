import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { authSessionRedirect, checkoutSessionOutcome, type CheckoutSessionOutcome } from "./outcome";

export async function openCheckoutSession(checkoutUrl: string): Promise<CheckoutSessionOutcome> {
  const api = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirect = authSessionRedirect(Platform.OS, api, Linking.createURL("bookings"));
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, redirect);
  return checkoutSessionOutcome(result);
}
