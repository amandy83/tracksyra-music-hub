import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import nodemailer from "npm:nodemailer@6.9.14";
import { renderTemplate } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000];
const BRAND_FROM_NAME = "TrackSyra Team";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeSubject = (subject: string) =>
  subject.startsWith("[TrackSyra]") ? subject : `[TrackSyra] ${subject}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const env = validateRuntimeEnv();
  if (!env.ok) return json({ error: "Missing Supabase runtime configuration", missing: env.missing }, 500);

  const supabase = createClient(
    env.values.SUPABASE_URL!,
    env.values.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { test, to, log_id } = body;

  if (!test) {
    console.warn("[send-emails] Direct email log draining is disabled; BullMQ email worker owns delivery.", { log_id });
    return json({
      ok: true,
      disabled: "bullmq_email_worker",
      processed: 0,
      sent: 0,
      failed: 0,
    });
  }

  const { data: smtp } = await supabase
    .from("smtp_settings")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const emailProvider = Deno.env.get("EMAIL_PROVIDER");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const host = smtp?.host || Deno.env.get("SMTP_HOST");
  const port = smtp?.port || Number(Deno.env.get("SMTP_PORT") || 587);
  const secure = smtp?.secure ?? (port === 465);
  const user = smtp?.username || Deno.env.get("SMTP_USERNAME") || Deno.env.get("SMTP_USER");
  const pass = smtp?.password || Deno.env.get("SMTP_PASSWORD") || Deno.env.get("SMTP_PASS");
  const fromName = smtp?.from_name || Deno.env.get("SMTP_FROM_NAME") || BRAND_FROM_NAME;
  const fromEmail = smtp?.from_email || Deno.env.get("EMAIL_FROM") || user;
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || Deno.env.get("REPLY_TO_EMAIL") || fromEmail;
  const hasResend = Boolean(resendApiKey);
  const hasSmtp = Boolean(host && user && pass && fromEmail);

  if (!hasResend && !hasSmtp) {
    console.warn("[send-emails] No Resend or SMTP config found. Queue left pending; no crash.");
    return json({ warning: "Email provider not configured", processed: 0, sent: 0, failed: 0 });
  }

  const transporter = hasSmtp ? nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  }) : null;

  if (test && to) {
    try {
      const { html, text } = renderTemplate("test", { name: "Admin" });
      await sendWithRetry({
        supabase,
        resendApiKey,
        transporter,
        preferResend: emailProvider === "resend" || !emailProvider,
        from: `"${fromName}" <${fromEmail}>`,
        replyTo,
        to,
        subject: "TrackSyra email test",
        html,
        text,
      });
      return json({ ok: true });
    } catch (error: any) {
      return json({ error: error.message }, 500);
    }
  }

  console.warn("[send-emails] Legacy email log draining is disabled; pass test=true and to=<email> only for provider smoke tests.", { log_id });
  return json({
    ok: true,
    disabled: "bullmq_email_worker",
    processed: 0,
    sent: 0,
    failed: 0,
  });

  let query = supabase.from("email_logs").select("*").lt("attempts", MAX_ATTEMPTS);
  query = log_id ? query.eq("id", log_id) : query.eq("status", "pending");
  const { data: logs } = await query.limit(50);

  let sent = 0;
  let failed = 0;
  for (const log of logs || []) {
    try {
      const { html, text } = renderTemplate(log.template, log.template_data || {});
      await sendWithRetry({
        supabase,
        resendApiKey,
        transporter,
        preferResend: emailProvider === "resend" || !emailProvider,
        from: `"${fromName}" <${fromEmail}>`,
        replyTo,
        to: log.recipient_email,
        subject: log.subject,
        html,
        text,
      });
      await supabase.from("email_logs").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: (log.attempts || 0) + 1,
        error_message: null,
      }).eq("id", log.id);
      sent++;
    } catch (error: any) {
      const attempts = (log.attempts || 0) + 1;
      await supabase.from("email_logs").update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        error_message: error.message,
      }).eq("id", log.id);
      failed++;
    }
  }

  return json({ sent, failed, processed: logs?.length || 0 });
});

async function sendWithRetry(input: {
  supabase: any;
  resendApiKey?: string | null;
  transporter: any;
  preferResend: boolean;
  from: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const subject = normalizeSubject(input.subject);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const providerResponse = input.preferResend && input.resendApiKey
        ? await sendViaResend(input.resendApiKey, { ...input, subject })
        : await sendViaSmtp({ ...input, subject });

      await logDelivery(input.supabase, {
        to_email: input.to,
        subject,
        status: "SENT",
        provider_response: { ...providerResponse, attempt },
      });
      return providerResponse;
    } catch (error: any) {
      lastError = error;
      const status = attempt >= MAX_ATTEMPTS ? "FAILED" : "RETRYING";
      await logDelivery(input.supabase, {
        to_email: input.to,
        subject,
        status,
        provider_response: { attempt },
        error_message: error?.message || String(error),
      });
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  throw lastError;
}

async function sendViaResend(apiKey: string, input: {
  from: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || undefined,
      headers: { "X-Entity-Ref-ID": "tracksyra-artist-onboarding" },
    }),
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  return { provider: "resend", response: await response.json() };
}

async function sendViaSmtp(input: {
  transporter: any;
  from: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  if (!input.transporter) throw new Error("SMTP transporter is not configured");
  const info = await input.transporter.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo || undefined,
    headers: { "X-Entity-Ref-ID": "tracksyra-artist-onboarding" },
  });
  return { provider: "smtp", messageId: info.messageId };
}

async function logDelivery(supabase: any, entry: {
  to_email: string;
  subject: string;
  status: "SENT" | "FAILED" | "RETRYING";
  provider_response?: Record<string, unknown>;
  error_message?: string | null;
}) {
  const { error } = await supabase.from("email_delivery_logs").insert({
    to_email: entry.to_email,
    subject: entry.subject,
    status: entry.status,
    provider_response: entry.provider_response || {},
    error_message: entry.error_message || null,
  });
  if (error) console.warn("[send-emails] Failed to write email_delivery_logs", error.message);
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateRuntimeEnv() {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const values = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)])) as Record<typeof names[number], string | undefined>;
  const missing = names.filter((name) => !values[name]);
  console.info("[send-emails] env loaded", { source: "Deno.env" });
  if (missing.length) console.warn("[send-emails] missing env", { missing });
  console.info("[send-emails] runtime env validation", {
    ok: missing.length === 0,
    values: Object.fromEntries(names.map((name) => [name, mask(values[name])])),
  });
  return { ok: missing.length === 0, missing, values };
}

function mask(value?: string) {
  if (!value) return "<missing>";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
