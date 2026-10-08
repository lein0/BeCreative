import type { ExpoConfig } from "expo/config";

const linkHost = process.env.LINK_HOST || "classes.becreative.app";
const iosBundleId = process.env.IOS_BUNDLE_ID || "com.becreative.students";
const androidPackage = process.env.ANDROID_PACKAGE || "com.becreative.students";

const config: ExpoConfig = {
  name: "BeCreative",
  slug: "becreative",
  scheme: "becreative",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  backgroundColor: "#f6f1e8",
  ios: {
    bundleIdentifier: iosBundleId,
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${linkHost}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCalendarsUsageDescription: "BeCreative adds classes you book to your calendar.",
      NSCalendarsFullAccessUsageDescription: "BeCreative adds classes you book to your calendar.",
    },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#5b21b6",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: linkHost, pathPrefix: "/c" },
          { scheme: "https", host: linkHost, pathPrefix: "/t" },
          { scheme: "https", host: linkHost, pathPrefix: "/reset" },
          { scheme: "https", host: linkHost, pathPrefix: "/verify-email" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
    backgroundColor: "#f6f1e8",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        color: "#5b21b6",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "BeCreative adds classes you book to your calendar.",
      },
    ],
    [
      "@stripe/stripe-react-native",
      {
        merchantIdentifier: process.env.APPLE_MERCHANT_ID || "merchant.com.becreative.students",
        enableGooglePay: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000",
    apiMode: process.env.EXPO_PUBLIC_API_MODE || "mock",
    linkHost,
    stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "",
    appleServiceId: process.env.EXPO_PUBLIC_APPLE_SERVICE_ID || "",
    eas: {
      projectId: process.env.EAS_PROJECT_ID || "00000000-0000-4000-8000-000000000001",
    },
  },
  owner: process.env.EXPO_OWNER,
};

export default config;
