import { logger } from "./logger";

type CredentialNoticeReason = "account_activated" | "password_reset";

export type CredentialNoticePayload = {
  fullName: string;
  email?: string | null;
  phones: string[];
  temporaryPassword: string;
  reason: CredentialNoticeReason;
};

export type CredentialNoticeResult = {
  emailSent: boolean;
  smsSentCount: number;
  warnings: string[];
};

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromPhone: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function buildNoticeContent(payload: CredentialNoticePayload): {
  subject: string;
  plainText: string;
  html: string;
} {
  const reasonLabel = payload.reason === "account_activated" ? "Account Activated" : "Password Reset";
  const subject = `Teahouse Manager - ${reasonLabel}`;
  const plainText = [
    `Hello ${payload.fullName},`,
    "",
    `Your Teahouse Manager account update: ${reasonLabel}.`,
    `Temporary Password: ${payload.temporaryPassword}`,
    "",
    "Please login and change this password immediately.",
    "If you did not request this change, contact support.",
  ].join("\n");

  const html = [
    `<p>Hello <strong>${payload.fullName}</strong>,</p>`,
    `<p>Your Teahouse Manager account update: <strong>${reasonLabel}</strong>.</p>`,
    `<p>Temporary Password: <strong>${payload.temporaryPassword}</strong></p>`,
    `<p>Please login and change this password immediately.</p>`,
    `<p>If you did not request this change, contact support.</p>`,
  ].join("");

  return { subject, plainText, html };
}

async function sendEmailViaResend(
  to: string,
  subject: string,
  plainText: string,
  html: string,
): Promise<void> {
  const apiKey = normalizeText(process.env.RESEND_API_KEY);
  const from = normalizeText(process.env.NOTIFY_EMAIL_FROM) || "Teahouse Manager <noreply@teahouse.local>";
  const replyTo = normalizeText(process.env.NOTIFY_EMAIL_REPLY_TO);
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    text: plainText,
    html,
  };
  if (replyTo) body.reply_to = replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend API failed (${response.status}): ${message.slice(0, 200)}`);
  }
}

function getTwilioConfig(): TwilioConfig {
  const accountSid = normalizeText(process.env.TWILIO_ACCOUNT_SID);
  const authToken = normalizeText(process.env.TWILIO_AUTH_TOKEN);
  const fromPhone = normalizeText(process.env.TWILIO_FROM_PHONE);
  if (!accountSid || !authToken || !fromPhone) {
    throw new Error("TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_PHONE are required.");
  }
  return { accountSid, authToken, fromPhone };
}

async function sendSmsViaTwilio(toPhone: string, messageBody: string): Promise<void> {
  const config = getTwilioConfig();
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const form = new URLSearchParams({
    To: toPhone,
    From: config.fromPhone,
    Body: messageBody,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Twilio API failed (${response.status}): ${message.slice(0, 200)}`);
  }
}

export async function sendCredentialNotification(
  payload: CredentialNoticePayload,
): Promise<CredentialNoticeResult> {
  const normalizedEmail = normalizeText(payload.email);
  const normalizedPhones = [...new Set(payload.phones.map(normalizePhone).filter(Boolean))];
  const { subject, plainText, html } = buildNoticeContent(payload);

  const emailProvider = (normalizeText(process.env.NOTIFY_EMAIL_PROVIDER) || "log").toLowerCase();
  const smsProvider = (normalizeText(process.env.NOTIFY_SMS_PROVIDER) || "log").toLowerCase();
  const warnings: string[] = [];
  let emailSent = false;
  let smsSentCount = 0;

  if (normalizedEmail) {
    try {
      if (emailProvider === "resend") {
        await sendEmailViaResend(normalizedEmail, subject, plainText, html);
        emailSent = true;
      } else if (emailProvider === "log") {
        logger.info(
          { to: normalizedEmail, subject, reason: payload.reason },
          "Email provider is log mode; email send simulated.",
        );
        emailSent = true;
      } else {
        warnings.push(`Unsupported email provider: ${emailProvider}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error";
      warnings.push(`Email send failed: ${message}`);
      logger.warn({ err: error, to: normalizedEmail }, "Credential email send failed");
    }
  } else {
    warnings.push("No customer email available.");
  }

  if (normalizedPhones.length > 0) {
    for (const phone of normalizedPhones) {
      try {
        const smsBody = `${subject}\nTemporary Password: ${payload.temporaryPassword}\nPlease login and change it immediately.`;
        if (smsProvider === "twilio") {
          await sendSmsViaTwilio(phone, smsBody);
          smsSentCount += 1;
        } else if (smsProvider === "log") {
          logger.info(
            { to: phone, reason: payload.reason },
            "SMS provider is log mode; sms send simulated.",
          );
          smsSentCount += 1;
        } else {
          warnings.push(`Unsupported SMS provider: ${smsProvider}`);
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown SMS error";
        warnings.push(`SMS send failed (${phone}): ${message}`);
        logger.warn({ err: error, to: phone }, "Credential SMS send failed");
      }
    }
  } else {
    warnings.push("No customer phone available.");
  }

  return {
    emailSent,
    smsSentCount,
    warnings,
  };
}

