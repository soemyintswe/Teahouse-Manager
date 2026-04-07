export function getWebBaseUrl(): string {
  const envBase = import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined;
  if (envBase && envBase.trim().length > 0) {
    return envBase.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "https://teahouse-web.onrender.com";
}

export function buildTableScanLink(tableId: number): string {
  const base = getWebBaseUrl();
  return `${base}/orders?tableId=${tableId}&scan=1`;
}

export function buildMenuItemScanLink(menuItemId: number): string {
  const base = getWebBaseUrl();
  return `${base}/orders?menuItemId=${menuItemId}&scan=1`;
}

export function buildQrImageUrl(data: string, size = 260): string {
  const clampedSize = Number.isFinite(size) ? Math.min(Math.max(Math.round(size), 120), 1200) : 260;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${clampedSize}x${clampedSize}&data=${encodeURIComponent(data)}`;
}

export function openQrPrintWindow(input: {
  title: string;
  subtitle?: string;
  qrImageUrl: string;
  qrValue: string;
}): void {
  if (typeof window === "undefined") return;
  const popup = window.open("", "_blank", "width=520,height=760");
  if (!popup) return;

  const escapedTitle = escapeHtml(input.title);
  const escapedSubtitle = escapeHtml(input.subtitle ?? "");
  const escapedQrValue = escapeHtml(input.qrValue);
  const escapedQrImage = escapeHtml(input.qrImageUrl);

  popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 18px;
        color: #111827;
      }
      .card {
        border: 2px solid #111827;
        border-radius: 14px;
        padding: 20px;
        text-align: center;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      p {
        margin: 0;
      }
      .sub {
        margin-bottom: 14px;
        color: #374151;
        font-size: 15px;
      }
      .qr {
        width: 280px;
        height: 280px;
        object-fit: contain;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
      }
      .value {
        margin-top: 10px;
        font-size: 11px;
        color: #6b7280;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapedTitle}</h1>
      ${escapedSubtitle ? `<p class="sub">${escapedSubtitle}</p>` : ""}
      <img src="${escapedQrImage}" class="qr" alt="QR code" />
      <p class="value">${escapedQrValue}</p>
    </div>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </body>
</html>`);
  popup.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
