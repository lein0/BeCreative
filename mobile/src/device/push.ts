import { Platform } from "react-native";
import type { StudentApi } from "../api";
import type { PlatformName } from "../api/types";

export async function registerPush(api: StudentApi): Promise<{ status: "granted" | "denied" | "preview"; token: string | null }> {
  const platform: PlatformName = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";
  if (Platform.OS === "web" || api.mode === "mock") {
    const token = "ExponentPushToken[preview]";
    await api.registerPushToken({ token, platform, provider: "expo" });
    return { status: "preview", token };
  }
  const Notifications = await import("expo-notifications");
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return { status: "denied", token: null };
  const Constants = await import("expo-constants");
  const projectId = Constants.default.expoConfig?.extra?.eas?.projectId as string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.registerPushToken({ token: token.data, platform, provider: "expo" });
  return { status: "granted", token: token.data };
}
