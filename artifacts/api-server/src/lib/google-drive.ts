import { createSign } from "node:crypto";

type GoogleOAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type UploadMenuImageInput = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

type UploadMenuImageResult = {
  fileId: string;
  imageUrl: string;
  webViewLink: string;
  downloadUrl: string;
};

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

async function requestGoogleAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.trim();

  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Google Drive is not configured. Missing GOOGLE_DRIVE_CLIENT_EMAIL or GOOGLE_DRIVE_PRIVATE_KEY.");
  }

  const privateKey = normalizePrivateKey(privateKeyRaw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await response.json()) as GoogleOAuthTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description || body.error || `Google OAuth failed with status ${response.status}.`,
    );
  }

  return body.access_token;
}

export async function uploadMenuImageToDrive(input: UploadMenuImageInput): Promise<UploadMenuImageResult> {
  const accessToken = await requestGoogleAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const sanitizedFileName = input.fileName.trim().replace(/[^\w.\-() ]/g, "_") || `menu-${Date.now()}.jpg`;
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const fileBuffer = Buffer.from(input.base64Data, "base64");

  if (!Number.isFinite(fileBuffer.length) || fileBuffer.length < 8) {
    throw new Error("Invalid image data.");
  }

  const metadata: Record<string, unknown> = { name: sanitizedFileName };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = `----teahouse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;
  const mediaHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: binary\r\n\r\n`;
  const closing = `\r\n--${boundary}--\r\n`;

  const multipartBody = Buffer.concat([
    Buffer.from(metadataPart, "utf8"),
    Buffer.from(mediaHeader, "utf8"),
    fileBuffer,
    Buffer.from(closing, "utf8"),
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  const uploadBody = (await uploadRes.json()) as { id?: string; error?: { message?: string } };
  if (!uploadRes.ok || !uploadBody.id) {
    throw new Error(uploadBody.error?.message || `Drive upload failed (${uploadRes.status}).`);
  }

  const fileId = uploadBody.id;

  // Best-effort: allow public read so the image can be shown on web/app.
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    });
  } catch {
    // Ignore permission call errors. If sharing is restricted by org policy,
    // caller can still use the Drive link in authenticated contexts.
  }

  return {
    fileId,
    imageUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
    webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}
