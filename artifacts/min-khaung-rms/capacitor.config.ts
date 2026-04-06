import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.teahouse.manager",
  appName: "Teahouse Manager",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
};

export default config;
