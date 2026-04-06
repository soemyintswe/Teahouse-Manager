import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

if (configuredApiBaseUrl) {
  setBaseUrl(configuredApiBaseUrl);
} else if (Capacitor.isNativePlatform()) {
  // Native app မှာ /api relative path ကို မသုံးနိုင်သောကြောင့်
  // API Base URL မထည့်ထားပါက network call မအောင်မြင်နိုင်သည်။
  console.warn("VITE_API_BASE_URL is not configured for native app.");
}

createRoot(document.getElementById("root")!).render(<App />);
