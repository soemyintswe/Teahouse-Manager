import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import mm from "./locales/mm.json";

type SupportedLanguage = "en" | "mm";

const STORAGE_KEY = "teahouse_language";
const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "mm"];

function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return Boolean(value && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage));
}

function detectLanguage(): SupportedLanguage {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  }

  if (typeof navigator !== "undefined") {
    const normalized = navigator.language.toLowerCase();
    if (normalized.startsWith("my") || normalized.startsWith("mm")) {
      return "mm";
    }
  }

  return "en";
}

function applyLanguageAttributes(language: string) {
  if (typeof document === "undefined") {
    return;
  }

  const normalized: SupportedLanguage = language === "mm" ? "mm" : "en";
  const html = document.documentElement;
  html.lang = normalized === "mm" ? "my" : "en";
  html.dataset.lang = normalized;
  html.classList.toggle("lang-mm", normalized === "mm");
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    mm: { translation: mm },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  react: {
    useSuspense: false,
  },
});

i18n.on("languageChanged", (language) => {
  applyLanguageAttributes(language);

  if (typeof window !== "undefined") {
    const normalized: SupportedLanguage = language === "mm" ? "mm" : "en";
    window.localStorage.setItem(STORAGE_KEY, normalized);
  }
});

applyLanguageAttributes(i18n.resolvedLanguage ?? i18n.language);

export default i18n;
