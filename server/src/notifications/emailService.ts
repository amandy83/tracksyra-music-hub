import { loadRuntimeEnv } from "../config/envLoader";
import net from "node:net";
import tls from "node:tls";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
};

export type EmailResult = {
  provider: "resend" | "smtp" | "console";
  messageId?: string;
  providerResponse?: Record<string, unknown>;
  attempts: number;
};

export type EmailDeliveryStatus = "SENT" | "FAILED" | "RETRYING";

export type EmailDeliveryLogger = (entry: {
  to_email: string;
  subject: string;
  status: EmailDeliveryStatus;
  provider_response?: Record<string, unknown>;
  message_id?: string | null;
  smtp_response?: string | null;
  error_message?: string | null;
}) => Promise<void> | void;

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000];
let deliveryLogger: EmailDeliveryLogger | null = null;

const env = (name: string) =>
  {
    loadRuntimeEnv();
    return typeof globalThis !== "undefined" && (globalThis as any).process?.env
      ? (globalThis as any).process.env[name]
      : undefined;
  };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BRAND = {
  name: "TrackSyra",
  site: "https://hello.tracksyra.com",
  dashboard: "https://hello.tracksyra.com/dashboard",
  support: "support@tracksyra.com",
  primary: "#ec4899",
  primaryDark: "#be185d",
  bg: "#fdf2f8",
  text: "#1f2937",
  muted: "#6b7280",
};

export function setEmailDeliveryLogger(logger: EmailDeliveryLogger | null) {
  deliveryLogger = logger;
}

export function validateEmailEnvironment() {
  loadRuntimeEnv();
  const provider = env("EMAIL_PROVIDER");
  const hasResend = Boolean(env("RESEND_API_KEY"));
  const hasSmtp = Boolean(env("SMTP_HOST") && env("SMTP_USERNAME") && env("SMTP_PASSWORD") && (env("SMTP_FROM_EMAIL") || env("EMAIL_FROM")));

  if (provider && !["resend", "smtp", "console"].includes(provider)) {
    console.warn(`[email] Unsupported EMAIL_PROVIDER="${provider}". Falling back to auto detection.`);
  }
  if (!hasResend && !hasSmtp) {
    console.warn("[email] No Resend or SMTP configuration found. Email sends will be logged in development and skipped safely elsewhere.");
  }

  return { provider, hasResend, hasSmtp };
}

export function renderEmailTemplate(template: string, data: Record<string, any>) {
  const name = escapeHtml(String(data.name || "Artist"));
  const notes = data.notes ? `<p><strong>Note:</strong> ${escapeHtml(String(data.notes))}</p>` : "";
  const message = escapeHtml(String(data.message || ""));
  const dashboardUrl = escapeHtml(String(data.dashboard_url || BRAND.dashboard));

  if (template === "welcome") {
    return brandEmailLayout({
      title: `Welcome to TrackSyra, ${name}!`,
      body: `<p>Hi ${name},</p><p>Your account is ready. Start uploading songs, pitch playlists, and track your royalties from one dashboard.</p>`,
      cta: { label: "Open Dashboard", url: dashboardUrl },
    });
  }
  if (template === "artist_request_pending") {
    return brandEmailLayout({
      title: "Your artist request is pending",
      body: `<p>Hi ${name},</p><p>Your request is under review. We will notify you once approved.</p>`,
      cta: { label: "Open Dashboard", url: dashboardUrl },
    });
  }
  if (template === "artist_request_approved") {
    const artistId = escapeHtml(String(data.artist_id || ""));
    return brandEmailLayout({
      title: "Your artist request is approved",
      body: [
      `<p>Hi ${name},</p><p>Your request is approved.</p>`,
      `<p>Your Artist ID is: <strong>${artistId}</strong></p>`,
      `<p>You can now log in to your artist dashboard and upload releases.</p>`,
      `<p>Next steps: complete your profile, prepare validated audio and cover art, then submit your first release.</p>`,
      ].join(""),
      cta: { label: "Open Dashboard", url: dashboardUrl },
    });
  }
  if (template === "artist_request_rejected") {
    return brandEmailLayout({
      title: "Update on your artist request",
      body: `<p>Hi ${name},</p><p>Your artist request was not approved at this time.</p>${notes}`,
      cta: { label: "Contact Support", url: `mailto:${BRAND.support}` },
    });
  }
  if (template === "password_reset") {
    const resetUrl = escapeHtml(String(data.reset_url || BRAND.site));
    return brandEmailLayout({
      title: "Reset your TrackSyra password",
      body: `<p>Hi ${name},</p><p>We received a request to reset your TrackSyra password. Use the secure link below to choose a new password.</p><p>This link can only be used once. If you did not request it, you can ignore this email.</p>`,
      cta: { label: "Reset Password", url: resetUrl },
    });
  }
  if (template === "form_approved") {
    return brandEmailLayout({
      title: "Your TrackSyra application is approved",
      body: `<p>Hi ${name},</p><p>Great news. Your ${escapeHtml(String(data.form_type || "application"))} has been approved.</p>${notes}`,
      cta: { label: "Open Dashboard", url: dashboardUrl },
    });
  }
  if (template === "application_approved") {
    return renderEmailTemplate("form_approved", data);
  }
  if (template === "application_rejected") {
    return renderEmailTemplate("form_rejected", data);
  }
  if (template === "form_rejected") {
    return brandEmailLayout({
      title: "Update on your TrackSyra application",
      body: `<p>Hi ${name},</p><p>Thanks for your interest in TrackSyra. After review, we cannot move forward at this time.</p>${notes}`,
      cta: { label: "Contact Support", url: `mailto:${BRAND.support}` },
    });
  }
  if (template === "admin_notification" || template === "contact_form_notification") {
    return brandEmailLayout({
      title: template === "contact_form_notification" ? "New contact form submission" : "TrackSyra admin notification",
      body: `<p>Hi Admin,</p><p>${message || "A TrackSyra admin event requires review."}</p>`,
      cta: { label: "Open Admin", url: `${BRAND.site}/admin` },
    });
  }
  return brandEmailLayout({
    title: "Hello from TrackSyra",
    body: `<p>Hi ${name},</p><p>${message || "Thanks for being part of TrackSyra."}</p>`,
    cta: { label: "Open Dashboard", url: dashboardUrl },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const normalizedSubject = normalizeSubject(subject);
  const normalizedHtml = ensureBrandedHtml(normalizedSubject, html);
  const text = stripHtml(normalizedHtml);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await sendEmailOnce({ to, subject: normalizedSubject, html: normalizedHtml, text });
      await logDelivery({
        to_email: to,
        subject: normalizedSubject,
        status: "SENT",
        message_id: result.messageId || null,
        smtp_response: stringValue(result.providerResponse?.smtpResponse),
        provider_response: { provider: result.provider, messageId: result.messageId, attempts: attempt, ...result.providerResponse },
      });
      return { ...result, attempts: attempt };
    } catch (error: any) {
      lastError = error;
      const status: EmailDeliveryStatus = attempt >= MAX_ATTEMPTS ? "FAILED" : "RETRYING";
      await logDelivery({
        to_email: to,
        subject: normalizedSubject,
        status,
        error_message: error?.message || String(error),
      });
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Email delivery failed"));
}

export async function sendQueuedEmail(payload: EmailPayload): Promise<EmailResult> {
  const normalizedSubject = normalizeSubject(payload.subject);
  const normalizedHtml = ensureBrandedHtml(normalizedSubject, payload.html);
  const result = await sendEmailOnce({
    ...payload,
    subject: normalizedSubject,
    html: normalizedHtml,
    text: payload.text || stripHtml(normalizedHtml),
  });
  await logDelivery({
    to_email: payload.to,
    subject: normalizedSubject,
    status: "SENT",
    message_id: result.messageId || null,
    smtp_response: stringValue(result.providerResponse?.smtpResponse),
    provider_response: {
      provider: result.provider,
      messageId: result.messageId,
      attempts: 1,
      ...(payload.metadata || {}),
      ...result.providerResponse,
    },
  });
  return { ...result, attempts: 1 };
}

async function sendEmailOnce(payload: EmailPayload): Promise<Omit<EmailResult, "attempts">> {
  const config = validateEmailEnvironment();
  const selectedProvider = env("EMAIL_PROVIDER");
  if ((selectedProvider === "resend" || !selectedProvider) && config.hasResend) {
    const resendApiKey = env("RESEND_API_KEY")!;
    const from = env("EMAIL_FROM") || "TrackSyra Team <noreply@tracksyra.com>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: env("EMAIL_REPLY_TO") || env("REPLY_TO_EMAIL") || env("SMTP_FROM_EMAIL") || env("EMAIL_FROM"),
        headers: {
          "X-Entity-Ref-ID": "tracksyra-artist-onboarding",
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email failed: ${response.status} ${body}`);
    }
    const data = await response.json() as { id?: string };
    return { provider: "resend", messageId: data.id, providerResponse: { resend: data } };
  }

  if ((selectedProvider === "smtp" || !selectedProvider) && config.hasSmtp) {
    return sendSmtpEmail(payload);
  }

  if (env("NODE_ENV") !== "production") {
    console.warn("[email] Console email fallback", {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
  } else {
    console.warn("[email] Email skipped because no provider is configured.");
  }
  return { provider: "console", messageId: `console:${Date.now()}`, providerResponse: { provider: "console" } };
}

async function sendSmtpEmail(payload: EmailPayload): Promise<Omit<EmailResult, "attempts">> {
  const config = readSmtpConfig();
  const messageId = `<tracksyra-${Date.now()}-${Math.random().toString(16).slice(2)}@${config.fromEmail.split("@")[1] || "tracksyra.local"}>`;
  const smtpResponse = await sendRawSmtp(config, {
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || stripHtml(payload.html),
    replyTo: env("EMAIL_REPLY_TO") || env("REPLY_TO_EMAIL") || config.fromEmail,
    messageId,
  });
  return { provider: "smtp", messageId, providerResponse: { smtpResponse: smtpResponse.text, smtpCode: smtpResponse.code } };
}

function readSmtpConfig(): SmtpConfig {
  const host = env("SMTP_HOST");
  const username = env("SMTP_USERNAME");
  const password = env("SMTP_PASSWORD");
  const fromEmail = env("SMTP_FROM_EMAIL") || env("EMAIL_FROM");
  if (!host || !username || !password || !fromEmail) {
    throw new Error("Email provider is not configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD/SMTP_FROM_EMAIL.");
  }

  return {
    host,
    port: Number(env("SMTP_PORT") || 587),
    secure: env("SMTP_SECURE") === "true",
    username,
    password,
    fromName: env("SMTP_FROM_NAME") || "TrackSyra Team",
    fromEmail,
  };
}

function normalizeSubject(subject: string) {
  return subject.startsWith("[TrackSyra]") ? subject : `[TrackSyra] ${subject}`;
}

function ensureBrandedHtml(subject: string, html: string) {
  if (/data-tracksyra-email="branded"/i.test(html) || /<body[^>]*data-tracksyra-email="branded"/i.test(html)) {
    return html;
  }
  const title = subject.replace(/^\[TrackSyra\]\s*/, "");
  return brandEmailLayout({
    title,
    body: html,
    cta: { label: "Open TrackSyra", url: BRAND.dashboard },
  });
}

function brandEmailLayout(input: {
  title: string;
  body: string;
  cta: { label: string; url: string };
}) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${input.title}</title>
</head>
<body data-tracksyra-email="branded" style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${BRAND.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #fce7f3;">
          <tr>
            <td style="background:${BRAND.primary};background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:28px 28px;text-align:center;">
              <div style="font-size:28px;line-height:1;font-weight:800;color:#ffffff;">${BRAND.name}</div>
              <div style="font-size:13px;line-height:1.5;color:#fce7f3;margin-top:6px;">Music Distribution Platform</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.text};">${input.title}</h1>
              <div style="font-size:15px;line-height:1.65;color:${BRAND.text};">${input.body}</div>
              <div style="text-align:center;margin:28px 0 4px;">
                <a href="${input.cta.url}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700;font-size:15px;">${input.cta.label}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#fff7fb;padding:20px 28px;text-align:center;border-top:1px solid #fce7f3;">
              <div style="font-size:12px;line-height:1.6;color:${BRAND.muted};">Need help? Contact <a href="mailto:${BRAND.support}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.support}</a></div>
              <div style="font-size:11px;line-height:1.6;color:${BRAND.muted};margin-top:10px;">Copyright ${year} ${BRAND.name}. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendRawSmtp(config: SmtpConfig, payload: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo: string;
  messageId: string;
}): Promise<SmtpResponse> {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host, timeout: 15000 })
    : net.connect({ host: config.host, port: config.port, timeout: 15000 });
  const reader = createSmtpReader(socket);

  try {
    await reader.expect(220);
    const ehlo = await reader.command(`EHLO ${env("SMTP_EHLO_DOMAIN") || "localhost"}`, 250);
    if (!config.secure && ehlo.text.includes("STARTTLS")) {
      await reader.command("STARTTLS", 220);
      throw new Error("STARTTLS SMTP mode is not supported by the built-in sender. Use SMTP_SECURE=true with port 465.");
    }
    const auth = Buffer.from(`\0${config.username}\0${config.password}`, "utf8").toString("base64");
    await reader.command(`AUTH PLAIN ${auth}`, 235);
    await reader.command(`MAIL FROM:<${config.fromEmail}>`, 250);
    await reader.command(`RCPT TO:<${payload.to}>`, [250, 251]);
    await reader.command("DATA", 354);
    socket.write(buildMimeMessage(config, payload));
    const response = await reader.expect(250);
    await reader.command("QUIT", 221).catch(() => undefined);
    return response;
  } finally {
    socket.end();
  }
}

function buildMimeMessage(config: SmtpConfig, payload: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo: string;
  messageId: string;
}) {
  const boundary = `tracksyra-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return [
    `From: ${formatAddress(config.fromName, config.fromEmail)}`,
    `To: ${payload.to}`,
    `Reply-To: ${payload.replyTo}`,
    `Subject: ${encodeHeader(payload.subject)}`,
    `Message-ID: ${payload.messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-Entity-Ref-ID: tracksyra-artist-onboarding",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeSmtpBody(payload.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeSmtpBody(payload.html),
    `--${boundary}--`,
    ".",
    "",
  ].join("\r\n");
}

function formatAddress(name: string, email: string) {
  const safeName = name.replace(/["\r\n]/g, "");
  return `"${safeName}" <${email}>`;
}

function encodeHeader(value: string) {
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value.replace(/[\r\n]/g, " ");
}

function normalizeSmtpBody(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function createSmtpReader(socket: net.Socket | tls.TLSSocket) {
  let buffer = "";
  const waiters: Array<{ resolve: (value: SmtpResponse) => void; reject: (error: Error) => void }> = [];
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    drain();
  });
  socket.on("error", (error) => {
    while (waiters.length) waiters.shift()?.reject(error);
  });
  socket.on("timeout", () => {
    const error = new Error("SMTP connection timed out");
    socket.destroy(error);
  });

  function drain() {
    const response = takeResponse();
    if (!response || !waiters.length) return;
    waiters.shift()?.resolve(response);
    drain();
  }

  function takeResponse(): SmtpResponse | null {
    const lines = buffer.split(/\r?\n/);
    if (lines.length < 2) return null;
    const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));
    if (completeIndex === -1) return null;
    const responseLines = lines.slice(0, completeIndex + 1);
    buffer = lines.slice(completeIndex + 1).join("\n");
    const last = responseLines[responseLines.length - 1];
    return { code: Number(last.slice(0, 3)), text: responseLines.join("\n") };
  }

  async function next() {
    const response = takeResponse();
    if (response) return response;
    return new Promise<SmtpResponse>((resolve, reject) => waiters.push({ resolve, reject }));
  }

  async function expect(codes: number | number[]) {
    const acceptedCodes = Array.isArray(codes) ? codes : [codes];
    const response = await next();
    if (!acceptedCodes.includes(response.code)) throw smtpError(response);
    return response;
  }

  async function command(value: string, codes: number | number[]) {
    socket.write(`${value}\r\n`);
    return expect(codes);
  }

  return { expect, command };
}

type SmtpResponse = {
  code: number;
  text: string;
};

function smtpError(response: SmtpResponse) {
  const error = new Error(response.text.replace(/\s+/g, " ").trim());
  (error as Error & { responseCode?: number }).responseCode = response.code;
  return error;
}

async function logDelivery(entry: Parameters<EmailDeliveryLogger>[0]) {
  if (!deliveryLogger && entry.status !== "SENT") {
    console.warn("[email] Delivery attempt did not complete", {
      to_email: entry.to_email,
      subject: entry.subject,
      status: entry.status,
      error_message: entry.error_message,
    });
  }
  try {
    await deliveryLogger?.(entry);
  } catch (error) {
    console.warn("[email] Delivery log write failed", error);
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

validateEmailEnvironment();
