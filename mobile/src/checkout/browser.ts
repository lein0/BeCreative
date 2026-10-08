import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export async function openCheckoutSession(checkoutUrl: string): Promise<"success" | "cancel" | "dismiss"> {
  const api = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirect = Platform.OS === "web" ? `${api}/bookings` : Linking.createURL("bookings");
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, redirect);
  if (result.type === "success") return "success";
  if (result.type === "cancel" || result.type === "dismiss") return result.type;
  return "dismiss";
}
