import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loadRuntimeEnv } from "../server/src/config/envLoader";
import { getSupabaseClient } from "../server/src/notifications/emailQueue";
import { renderEmailTemplate, sendEmail, setEmailDeliveryLogger } from "../server/src/notifications/emailService";

const TO = "amandeepy95@gmail.com";
const FROM = "noreply@hello.tracksyra.com";

loadRuntimeEnv();

const env = (name: string) => process.env[name];
const supabase = getSupabaseClient();

setEmailDeliveryLogger(async (entry) => {
  const { error } = await supabase.from("email_delivery_logs").insert({
    to_email: entry.to_email,
    subject: entry.subject,
    status: entry.status,
    provider_response: entry.provider_response || {},
    error_message: entry.error_message || null,
  });
  if (error) throw new Error(`Failed to write delivery log: ${error.message}`);
});

const startedAt = new Date().toISOString();
const runId = randomUUID();

const results: any[] = [];

await sendRendered("WELCOME EMAIL", "welcome", "Welcome to TrackSyra", {
  name: "Amandeep",
  qa_run_id: runId,
});

await sendRendered("APPROVAL EMAIL", "application_approved", "Your TrackSyra application is approved", {
  name: "Amandeep",
  form_type: "Publisher Inquiry",
  dashboard_url: "https://hello.tracksyra.com/dashboard",
  qa_run_id: runId,
});

await sendRendered("REJECTION EMAIL", "application_rejected", "Update on your TrackSyra application", {
  name: "Amandeep",
  form_type: "Publisher Inquiry",
  notes: "This is a production template QA rejection sample.",
  qa_run_id: runId,
});

await sendRendered("CONTACT EMAIL", "contact_form_notification", "New contact form submission", {
  name: "Amandeep QA",
  email: TO,
  form_type: "Publisher Inquiry",
  message: `Production contact form notification QA run ${runId}.`,
  qa_run_id: runId,
});

await triggerPasswordReset();

await sendRendered("ADMIN EMAIL", "admin_notification", "TrackSyra admin notification test", {
  name: "Admin",
  message: `Production admin notification QA run ${runId}.`,
  qa_run_id: runId,
});

const recentLogs = await supabase
  .from("email_delivery_logs")
  .select("id,to_email,subject,status,provider_response,error_message,created_at")
  .eq("to_email", TO)
  .gte("created_at", startedAt)
  .order("created_at", { ascending: false });

console.log(JSON.stringify({
  ok: results.every((result) => result.pass),
  runId,
  startedAt,
  fromConfig: {
    provider: env("EMAIL_PROVIDER") || null,
    emailFrom: env("EMAIL_FROM") || null,
    smtpFromEmail: env("SMTP_FROM_EMAIL") || null,
    smtpHost: env("SMTP_HOST") || null,
    smtpPort: env("SMTP_PORT") || null,
    smtpSecure: env("SMTP_SECURE") || null,
  },
  results,
  recentDeliveryLogs: recentLogs.data || [],
  recentDeliveryLogError: recentLogs.error?.message || null,
}, null, 2));

if (results.some((result) => !result.pass)) process.exitCode = 1;

async function sendRendered(label: string, template: string, subject: string, data: Record<string, unknown>) {
  const rendered = {
    html: renderEmailTemplate(template, data),
  };
  const checks = inspectRendered(rendered.html);
  try {
    const sent = await sendEmail(TO, subject, rendered.html);
    const log = await findDeliveryLog(subject, sent.messageId);
    results.push({
      label,
      pass: Boolean(sent.messageId && log && checks.htmlFormatting),
      productionPath: "renderEmailTemplate -> sendEmail -> email_delivery_logs",
      template,
      requestedSubject: subject,
      normalizedSubject: normalizeSubject(subject),
      provider: sent.provider,
      messageId: sent.messageId || null,
      smtpAccepted: sent.provider === "smtp" && Boolean(sent.messageId),
      deliveryLogFound: Boolean(log),
      deliveryLog: log,
      fromAlignment: fromAlignment(),
      renderChecks: checks,
    });
  } catch (error) {
    results.push({
      label,
      pass: false,
      productionPath: "renderEmailTemplate -> sendEmail -> email_delivery_logs",
      template,
      error: error instanceof Error ? error.message : String(error),
      fromAlignment: fromAlignment(),
      renderChecks: checks,
    });
  }
}

async function triggerPasswordReset() {
  try {
    const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
    const anon = env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY");
    if (!url || !anon) throw new Error("Missing Supabase anon configuration");
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const reset = await auth.auth.resetPasswordForEmail(TO, {
      redirectTo: "https://hello.tracksyra.com/reset-password",
    });
    const log = await findPasswordResetDeliveryLog();
    results.push({
      label: "PASSWORD RESET EMAIL",
      pass: false,
      productionPath: "Supabase Auth resetPasswordForEmail",
      apiAccepted: !reset.error,
      smtpAccepted: null,
      messageId: null,
      deliveryLogFound: Boolean(log),
      deliveryLog: log,
      fromAlignment: {
        pass: false,
        reason: "Supabase Auth email is outside TrackSyra emailService; Message-ID/from headers are not exposed without mailbox/provider event access.",
      },
      renderChecks: {
        resetLinkConfigured: true,
        resetRedirectTo: "https://hello.tracksyra.com/reset-password",
      },
      error: reset.error?.message || "Supabase accepted the reset request, but SMTP response, Message-ID, DKIM result, rendered HTML, and email_delivery_logs cannot be verified from the app path.",
    });
  } catch (error) {
    results.push({
      label: "PASSWORD RESET EMAIL",
      pass: false,
      productionPath: "Supabase Auth resetPasswordForEmail",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findDeliveryLog(subject: string, messageId?: string) {
  const normalized = normalizeSubject(subject);
  const query = supabase
    .from("email_delivery_logs")
    .select("id,to_email,subject,status,provider_response,error_message,created_at")
    .eq("to_email", TO)
    .gte("created_at", startedAt)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data, error } = await query.eq("subject", normalized);
  if (error) throw new Error(`email_delivery_logs lookup failed: ${error.message}`);
  return (data || []).find((row: any) =>
    !messageId || JSON.stringify(row.provider_response || {}).includes(messageId)
  ) || null;
}

async function findPasswordResetDeliveryLog() {
  const { data, error } = await supabase
    .from("email_delivery_logs")
    .select("id,to_email,subject,status,provider_response,error_message,created_at")
    .eq("to_email", TO)
    .gte("created_at", startedAt)
    .ilike("subject", "%reset%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`password reset delivery log lookup failed: ${error.message}`);
  return data || null;
}

function normalizeSubject(subject: string) {
  return subject.startsWith("[TrackSyra]") ? subject : `[TrackSyra] ${subject}`;
}

function fromAlignment() {
  const emailFrom = env("EMAIL_FROM") || "";
  const smtpFromEmail = env("SMTP_FROM_EMAIL") || "";
  return {
    pass: emailFrom === FROM && smtpFromEmail === FROM,
    emailFrom,
    smtpFromEmail,
    headerFromDomain: FROM.split("@")[1],
    envelopeFromDomain: smtpFromEmail.split("@")[1] || null,
  };
}

function inspectRendered(html: string) {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/gi)].map((match) => match[1]);
  return {
    htmlFormatting: /<html|<table|<p|<h1/i.test(html),
    hasTrackSyraBranding: /TrackSyra/i.test(html),
    links,
    linksValid: links.every((link) => link === "#" || /^https?:\/\//.test(link) || /^mailto:/i.test(link) || link.startsWith("/")),
    images,
    hasLogoImage: images.length > 0,
    brandingTextFallback: /Music Distribution Platform/i.test(html),
    hasFooter: /All rights reserved|Follow us/i.test(html),
    hasUnsubscribe: /unsubscribe/i.test(html),
  };
}
