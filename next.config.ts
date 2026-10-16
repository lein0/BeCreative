import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["pg", "qrcode", "@aws-sdk/client-s3", "@aws-sdk/client-ses", "@aws-sdk/client-pinpoint-sms-voice-v2", "@aws-sdk/s3-request-presigner"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
