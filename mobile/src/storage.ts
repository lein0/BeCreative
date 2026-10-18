import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export async function readStored(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return;
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage is a convenience. The in-memory session still works for this launch.
  }
}
