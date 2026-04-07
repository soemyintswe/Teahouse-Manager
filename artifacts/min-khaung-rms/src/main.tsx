import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";
import { RefreshCw } from "lucide-react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import i18n from "./i18n";
import "./index.css";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const fallbackCloudApiBaseUrl = "https://teahouse-api.onrender.com";
const startupHealthPath = "/api/healthz";
const startupTimeoutMs = 12000;

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
  | { status: "ready" }
  | { status: "error"; message: string; detail?: string };

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

function ErrorScreen({ message, detail }: { message: string; detail?: string }) {
  const apiInfo = resolvedApiBaseUrl ?? "Same-origin /api";

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-destructive/40 bg-card p-6 shadow-lg">
        <h1 className="text-xl font-bold text-destructive">{i18n.t("bootstrap.appErrorTitle")}</h1>
        <p className="mt-2 text-sm">{message}</p>
        <div className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p>{i18n.t("bootstrap.api")}: {apiInfo}</p>
          {detail ? <p className="mt-1 line-clamp-3">{detail}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          {i18n.t("common.retry")}
        </button>
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
      return <ErrorScreen message={this.state.error.message} detail={this.state.error.stack} />;
    }
    return this.props.children;
  }
}

function BootstrapApp() {
  const [state, setState] = React.useState<BootState>({
    status: "loading",
    message: i18n.t("bootstrap.initializing"),
  });

  React.useEffect(() => {
    let mounted = true;

    const applyError = (error: unknown) => {
      if (!mounted) return;
      const normalized = normalizeError(error);
      setState({
        status: "error",
        message: normalized.message,
        detail: normalized.detail,
      });
    };

    const handleWindowError = (event: ErrorEvent) => {
      applyError(event.error ?? new Error(event.message || i18n.t("bootstrap.unexpectedRuntime")));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      applyError(event.reason);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const runBootstrap = async () => {
      try {
        setState({ status: "loading", message: i18n.t("bootstrap.connectingApi") });
        await verifyServerReachable();
        if (!mounted) return;
        setState({ status: "ready" });
      } catch (error) {
        applyError(error);
      }
    };

    void runBootstrap();

    return () => {
      mounted = false;
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingScreen message={state.message} />;
  }

  if (state.status === "error") {
    return <ErrorScreen message={state.message} detail={state.detail} />;
  }

  return (
    <RuntimeErrorBoundary
      onError={(error) =>
        setState({
          status: "error",
          message: error.message || i18n.t("bootstrap.unexpectedRuntime"),
          detail: error.stack,
        })
      }
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
