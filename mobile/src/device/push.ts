import Constants from "expo-constants";
import { Platform } from "react-native";
import type { StudentApi } from "../api";

export async function registerPush(api: StudentApi): Promise<{ status: "granted" | "denied" | "preview"; token: string | null }> {
  const platform = Platform.OS === "android" ? "android" : "ios";
  if (Platform.OS === "web" || api.mode === "mock") {
    const token = "ExponentPushToken[preview]";
    await api.registerPushToken({ expoPushToken: token, platform });
    return { status: "preview", token };
  }
  const Notifications = await import("expo-notifications");
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return { status: "denied", token: null };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.registerPushToken({ expoPushToken: token.data, platform });
  return { status: "granted", token: token.data };
}
