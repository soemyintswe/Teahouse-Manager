function getApiBaseUrl(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase && envBase.length > 0) {
    return envBase.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/+$/, "");
    return origin;
  }
  return "";
}

function shouldProxy(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "drive.google.com" ||
    host.endsWith(".googleusercontent.com") ||
    host === "docs.google.com"
  );
}

export function resolveMenuImageUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!shouldProxy(parsed)) {
      return trimmed;
    }
    const apiBase = getApiBaseUrl();
    if (!apiBase) return trimmed;
    return `${apiBase}/api/menu-images/proxy?url=${encodeURIComponent(trimmed)}`;
  } catch {
    return trimmed;
  }
}
