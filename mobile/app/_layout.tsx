import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Outfit_400Regular, Outfit_500Medium } from "@expo-google-fonts/outfit";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { hrefForDeepLink, parseDeepLink } from "@mobile/linking/parse";
import { SessionProvider, useSession } from "@mobile/session";
import { PaymentsProvider } from "@mobile/stripe/provider";
import { ThemeProvider, useAppTheme } from "@mobile/theme/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Bridge() {
  const url = Linking.useURL();
  const router = useRouter();
  const { setAttribution } = useSession();
  useEffect(() => {
    if (!url) return;
    const link = parseDeepLink(url);
    if (!link) return;
    if (link.type === "bookings" || link.type === "reset" || link.type === "verify") {
      router.replace(hrefForDeepLink(link) as "/bookings");
      return;
    }
    setAttribution(link);
  }, [router, setAttribution, url]);
  return null;
}

function Shell() {
  const session = useSession();
  const [loaded, fontError] = useFonts({ Fraunces_600SemiBold, Outfit_400Regular, Outfit_500Medium });
  useEffect(() => {
    if ((loaded || fontError) && session.ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontError, loaded, session.ready]);
  return (
    <ThemeProvider
      vertical={session.vertical}
      schemePreference={session.schemePreference}
      fonts={{ display: loaded ? "Fraunces_600SemiBold" : "Georgia", body: loaded ? "Outfit_400Regular" : "System", medium: loaded ? "Outfit_500Medium" : "System" }}
    >
      <ThemedStack />
    </ThemeProvider>
  );
}

function ThemedStack() {
  const { colors, scheme } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center" }}>
      <View style={{ flex: 1, width: "100%", maxWidth: 480, backgroundColor: colors.bg }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Bridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaymentsProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </PaymentsProvider>
    </SafeAreaProvider>
  );
}
