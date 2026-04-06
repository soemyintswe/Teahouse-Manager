import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

type AppUpdateManifest = {
  version: string;
  apkUrl: string;
  notes?: string;
  force?: boolean;
};

const DEFAULT_UPDATE_MANIFEST_URL =
  "https://raw.githubusercontent.com/soemyintswe/Teahouse-Manager/main/mobile/app-update.json";

function parseVersion(version: string): number[] {
  return version
    .split(".")
    .map((segment) => Number(segment))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));
}

function isRemoteVersionNewer(currentVersion: string, remoteVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const remote = parseVersion(remoteVersion);
  const maxLength = Math.max(current.length, remote.length);

  for (let index = 0; index < maxLength; index += 1) {
    const left = current[index] ?? 0;
    const right = remote[index] ?? 0;

    if (right > left) return true;
    if (right < left) return false;
  }

  return false;
}

async function checkForUpdates(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }

  const manifestUrl = import.meta.env.VITE_APP_UPDATE_MANIFEST_URL || DEFAULT_UPDATE_MANIFEST_URL;
  const appInfo = await App.getInfo();

  try {
    const response = await fetch(`${manifestUrl}?_ts=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const manifest = (await response.json()) as Partial<AppUpdateManifest>;
    if (!manifest.version || !manifest.apkUrl) return;

    if (!isRemoteVersionNewer(appInfo.version, manifest.version)) {
      return;
    }

    const message = [
      `A new app version (${manifest.version}) is available.`,
      manifest.notes ? `\n${manifest.notes}` : "",
      "\n\nTap OK to download the latest APK.",
    ].join("");

    const accepted = window.confirm(message);
    if (!accepted) return;

    await Browser.open({ url: manifest.apkUrl });
  } catch {
    // Ignore update-check failures to avoid blocking app startup.
  }
}

export function setupAutoUpdate(): () => void {
  void checkForUpdates();

  let appStateHandle: { remove: () => Promise<void> } | null = null;
  void App.addListener("appStateChange", (state) => {
    if (state.isActive) {
      void checkForUpdates();
    }
  }).then((handle) => {
    appStateHandle = handle;
  });

  return () => {
    if (appStateHandle) {
      void appStateHandle.remove();
    }
  };
}
