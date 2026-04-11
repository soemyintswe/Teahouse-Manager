import { db, notificationLogsTable, settingsTable } from "@workspace/db";
import { logger } from "./logger";

type CredentialNoticeReason = "account_activated" | "password_reset";
type NotificationChannel = "email" | "sms";
type NotificationStatus = "sent" | "failed" | "skipped";

type NotificationTemplates = {
  activateEmailSubject: string;
  activateEmailBody: string;
  activateSmsBody: string;
  resetEmailSubject: string;
  resetEmailBody: string;
  resetSmsBody: string;
};

const DEFAULT_TEMPLATES: NotificationTemplates = {
  activateEmailSubject: "Teahouse Manager - Account Activated",
  activateEmailBody: [
    "Hello {{fullName}},",
    "",
    "Your Teahouse Manager account has been activated.",
    "Temporary Password: {{temporaryPassword}}",
    "",
    "Please login and change this password immediately.",
    "If you did not request this change, contact support.",
  ].join("\n"),
  activateSmsBody:
    "Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.",
  resetEmailSubject: "Teahouse Manager - Password Reset",
  resetEmailBody: [
    "Hello {{fullName}},",
    "",
    "Your Teahouse Manager password has been reset.",
    "Temporary Password: {{temporaryPassword}}",
    "",
    "Please login and change this password immediately.",
    "If you did not request this change, contact support.",
  ].join("\n"),
  resetSmsBody:
    "Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.",
};

export type CredentialNoticePayload = {
  customerId?: number | null;
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

type NoticeContent = {
  subject: string;
  plainText: string;
  html: string;
  smsText: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function applyTemplate(
  template: string,
  payload: CredentialNoticePayload,
  reasonLabel: string,
): string {
  const normalizedTemplate = template.trim();
  const input = normalizedTemplate.length > 0 ? normalizedTemplate : "{{reasonLabel}}";
  return input
    .replaceAll("{{fullName}}", payload.fullName)
    .replaceAll("{{temporaryPassword}}", payload.temporaryPassword)
    .replaceAll("{{reasonLabel}}", reasonLabel)
    .replaceAll("{{customerId}}", payload.customerId ? String(payload.customerId) : "")
    .trim();
}

function toSimpleHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br />")}</p>`);
  return paragraphs.join("");
}

async function loadNotificationTemplates(): Promise<NotificationTemplates> {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) return DEFAULT_TEMPLATES;
    return {
      activateEmailSubject: normalizeText(settings.notifyActivateEmailSubject) || DEFAULT_TEMPLATES.activateEmailSubject,
      activateEmailBody: normalizeText(settings.notifyActivateEmailBody) || DEFAULT_TEMPLATES.activateEmailBody,
      activateSmsBody: normalizeText(settings.notifyActivateSmsBody) || DEFAULT_TEMPLATES.activateSmsBody,
      resetEmailSubject: normalizeText(settings.notifyResetEmailSubject) || DEFAULT_TEMPLATES.resetEmailSubject,
      resetEmailBody: normalizeText(settings.notifyResetEmailBody) || DEFAULT_TEMPLATES.resetEmailBody,
      resetSmsBody: normalizeText(settings.notifyResetSmsBody) || DEFAULT_TEMPLATES.resetSmsBody,
    };
  } catch (error) {
    logger.warn({ err: error }, "Failed to load notification templates; fallback defaults will be used.");
    return DEFAULT_TEMPLATES;
  }
}

function buildNoticeContent(
  payload: CredentialNoticePayload,
  templates: NotificationTemplates,
): NoticeContent {
  const reasonLabel = payload.reason === "account_activated" ? "Account Activated" : "Password Reset";
  const selected = payload.reason === "account_activated"
    ? {
        subject: templates.activateEmailSubject,
        emailBody: templates.activateEmailBody,
        smsBody: templates.activateSmsBody,
      }
    : {
        subject: templates.resetEmailSubject,
        emailBody: templates.resetEmailBody,
        smsBody: templates.resetSmsBody,
      };

  const subject = applyTemplate(selected.subject, payload, reasonLabel);
  const plainText = applyTemplate(selected.emailBody, payload, reasonLabel);
  const smsText = applyTemplate(selected.smsBody, payload, reasonLabel);

  return {
    subject,
    plainText,
    html: toSimpleHtml(plainText),
    smsText,
  };
}

async function writeNotificationLog(input: {
  payload: CredentialNoticePayload;
  channel: NotificationChannel;
  provider: string;
  recipient: string | null;
  status: NotificationStatus;
  message: string;
  template: string;
}): Promise<void> {
  try {
    await db.insert(notificationLogsTable).values({
      customerId: input.payload.customerId ?? null,
      customerName: input.payload.fullName,
      reason: input.payload.reason,
      channel: input.channel,
      provider: input.provider,
      recipient: input.recipient,
      status: input.status,
      message: input.message,
      payload: JSON.stringify({
        template: input.template,
      }),
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to persist notification log record.");
  }
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
  const templates = await loadNotificationTemplates();
  const { subject, plainText, html, smsText } = buildNoticeContent(payload, templates);

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
        await writeNotificationLog({
          payload,
          channel: "email",
          provider: emailProvider,
          recipient: normalizedEmail,
          status: "sent",
          message: `Email sent with subject: ${subject}`,
          template: plainText,
        });
      } else if (emailProvider === "log") {
        logger.info(
          { to: normalizedEmail, subject, reason: payload.reason },
          "Email provider is log mode; email send simulated.",
        );
        emailSent = true;
        await writeNotificationLog({
          payload,
          channel: "email",
          provider: emailProvider,
          recipient: normalizedEmail,
          status: "sent",
          message: "Email send simulated in log mode.",
          template: plainText,
        });
      } else {
        const message = `Unsupported email provider: ${emailProvider}`;
        warnings.push(message);
        await writeNotificationLog({
          payload,
          channel: "email",
          provider: emailProvider,
          recipient: normalizedEmail,
          status: "failed",
          message,
          template: plainText,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error";
      warnings.push(`Email send failed: ${message}`);
      logger.warn({ err: error, to: normalizedEmail }, "Credential email send failed");
      await writeNotificationLog({
        payload,
        channel: "email",
        provider: emailProvider,
        recipient: normalizedEmail,
        status: "failed",
        message: `Email send failed: ${message}`,
        template: plainText,
      });
    }
  } else {
    const message = "No customer email available.";
    warnings.push(message);
    await writeNotificationLog({
      payload,
      channel: "email",
      provider: emailProvider,
      recipient: null,
      status: "skipped",
      message,
      template: plainText,
    });
  }

  if (normalizedPhones.length > 0) {
    for (const phone of normalizedPhones) {
      try {
        if (smsProvider === "twilio") {
          await sendSmsViaTwilio(phone, smsText);
          smsSentCount += 1;
          await writeNotificationLog({
            payload,
            channel: "sms",
            provider: smsProvider,
            recipient: phone,
            status: "sent",
            message: "SMS sent via Twilio.",
            template: smsText,
          });
        } else if (smsProvider === "log") {
          logger.info(
            { to: phone, reason: payload.reason },
            "SMS provider is log mode; sms send simulated.",
          );
          smsSentCount += 1;
          await writeNotificationLog({
            payload,
            channel: "sms",
            provider: smsProvider,
            recipient: phone,
            status: "sent",
            message: "SMS send simulated in log mode.",
            template: smsText,
          });
        } else {
          const message = `Unsupported SMS provider: ${smsProvider}`;
          warnings.push(message);
          await writeNotificationLog({
            payload,
            channel: "sms",
            provider: smsProvider,
            recipient: phone,
            status: "failed",
            message,
            template: smsText,
          });
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown SMS error";
        warnings.push(`SMS send failed (${phone}): ${message}`);
        logger.warn({ err: error, to: phone }, "Credential SMS send failed");
        await writeNotificationLog({
          payload,
          channel: "sms",
          provider: smsProvider,
          recipient: phone,
          status: "failed",
          message: `SMS send failed: ${message}`,
          template: smsText,
        });
      }
    }
  } else {
    const message = "No customer phone available.";
    warnings.push(message);
    await writeNotificationLog({
      payload,
      channel: "sms",
      provider: smsProvider,
      recipient: null,
      status: "skipped",
      message,
      template: smsText,
    });
  }

  return {
    emailSent,
    smsSentCount,
    warnings,
  };
}
