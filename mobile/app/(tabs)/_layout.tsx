import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function TabsLayout() {
  const { user, ready } = useSession();
  const { colors, fonts } = useAppTheme();
  if (ready && !user) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, minHeight: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} />, tabBarAccessibilityLabel: "Explore" }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />, tabBarAccessibilityLabel: "My bookings" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} />, tabBarAccessibilityLabel: "Wallet" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />, tabBarAccessibilityLabel: "Notifications" }} />
      <Tabs.Screen name="you" options={{ title: "You", tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />, tabBarAccessibilityLabel: "Profile" }} />
    </Tabs>
  );
}
