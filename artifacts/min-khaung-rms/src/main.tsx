import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import i18n from "./i18n";
import "./index.css";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const fallbackCloudApiBaseUrl = "https://teahouse-api.onrender.com";
const startupHealthPath = "/api/healthz";
const startupTimeoutMs = 12000;
const startupAutoRetryMs = 5000;

const resolvedApiBaseUrl = configuredApiBaseUrl
  ? configuredApiBaseUrl.replace(/\/+$/, "")
  : Capacitor.isNativePlatform()
    ? fallbackCloudApiBaseUrl
    : null;

if (resolvedApiBaseUrl) {
  setBaseUrl(resolvedApiBaseUrl);
}

type BootState =
  | { status: "loading"; message: string }
  | { status: "ready" };

type NormalizedError = {
  message: string;
  detail?: string;
};

function buildHealthUrl(): string {
  if (!resolvedApiBaseUrl) {
    return startupHealthPath;
  }
  return `${resolvedApiBaseUrl}${startupHealthPath}`;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      message: error.message || i18n.t("bootstrap.unexpectedApp"),
      detail: error.stack,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: i18n.t("bootstrap.unexpectedApp") };
}

async function verifyServerReachable(): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), startupTimeoutMs);

  try {
    const response = await fetch(buildHealthUrl(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(i18n.t("bootstrap.connectFailed", { status: response.status }));
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(i18n.t("bootstrap.timeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg text-center">
        <div className="mx-auto mb-4 relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-4 border-muted" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <h1 className="text-lg font-semibold">{i18n.t("bootstrap.startingTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-2">{message}</p>
      </div>
    </div>
  );
}

type RuntimeErrorBoundaryProps = React.PropsWithChildren<{
  onError: (error: Error) => void;
}>;

type RuntimeErrorBoundaryState = {
  error: Error | null;
};

class RuntimeErrorBoundary extends React.Component<
  RuntimeErrorBoundaryProps,
  RuntimeErrorBoundaryState
> {
  constructor(props: RuntimeErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render() {
    if (this.state.error) {
      return <LoadingScreen message={i18n.t("bootstrap.retrying")} />;
    }
    return this.props.children;
  }
}

function BootstrapApp() {
  const [state, setState] = React.useState<BootState>({
    status: "loading",
    message: i18n.t("bootstrap.initializing"),
  });
  const [retryTick, setRetryTick] = React.useState(0);
  const retryTimerRef = React.useRef<number | null>(null);

  const requestBootstrapRetry = React.useCallback((message: string) => {
    setState({
      status: "loading",
      message,
    });
    setRetryTick((prev) => prev + 1);
  }, []);

  const queueBootstrapRetry = React.useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setState({
      status: "loading",
      message: i18n.t("bootstrap.autoRetrying", { seconds: Math.ceil(startupAutoRetryMs / 1000) }),
    });

    retryTimerRef.current = window.setTimeout(() => {
      requestBootstrapRetry(i18n.t("bootstrap.retrying"));
    }, startupAutoRetryMs);
  }, [requestBootstrapRetry]);

  React.useEffect(() => {
    let mounted = true;

    const recoverFromError = (error: unknown) => {
      if (!mounted) return;
      const normalized = normalizeError(error);
      console.warn("[bootstrap] transient startup/runtime issue, retrying silently", normalized);
      queueBootstrapRetry();
    };

    const handleWindowError = (event: ErrorEvent) => {
      recoverFromError(event.error ?? new Error(event.message || i18n.t("bootstrap.unexpectedRuntime")));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recoverFromError(event.reason);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const runBootstrap = async () => {
      try {
        setState({ status: "loading", message: i18n.t("bootstrap.connectingApi") });
        await verifyServerReachable();
        if (!mounted) return;
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        setState({ status: "ready" });
      } catch (error) {
        recoverFromError(error);
      }
    };

    void runBootstrap();

    return () => {
      mounted = false;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [queueBootstrapRetry, retryTick]);

  if (state.status === "loading") {
    return <LoadingScreen message={state.message} />;
  }

  return (
    <RuntimeErrorBoundary
      onError={(error) => {
        console.warn("[bootstrap] runtime error captured, switching to silent recovery", error);
        queueBootstrapRetry();
      }}
    >
      <App />
    </RuntimeErrorBoundary>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

createRoot(rootElement).render(
  <I18nextProvider i18n={i18n}>
    <BootstrapApp />
  </I18nextProvider>,
);
