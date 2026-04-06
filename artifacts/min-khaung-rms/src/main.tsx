import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const fallbackCloudApiBaseUrl = "https://teahouse-api.onrender.com";

if (configuredApiBaseUrl) {
  setBaseUrl(configuredApiBaseUrl);
} else if (Capacitor.isNativePlatform()) {
  // Native app build time env မထည့်ထားသည့်အခါ cloud API ကို fallback သုံးမည်။
  setBaseUrl(fallbackCloudApiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
