import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../server/src/notifications/emailQueue";
import { sendEmail, setEmailDeliveryLogger } from "../server/src/notifications/emailService";

function loadEnv(path: string) {
  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const localEnv = { ...loadEnv(".env"), ...loadEnv(".admin-credentials.local") };
const to = process.argv[2] || localEnv.EMAIL_TEST_TO || localEnv.ADMIN_EMAIL;
if (!to) throw new Error("Pass test recipient as first argument or set EMAIL_TEST_TO/ADMIN_EMAIL.");

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

const flows = [
  {
    flow: "welcome",
    subject: "Welcome to TrackSyra",
    html: "<p>Hi Admin, your TrackSyra account is ready.</p>",
  },
  {
    flow: "contact_form",
    subject: "New contact form submission",
    html: "<p>A production-readiness contact form test was submitted and accepted.</p>",
  },
  {
    flow: "notification",
    subject: "TrackSyra notification test",
    html: "<p>This is a production-readiness notification test.</p>",
  },
];

const results = [];
for (const flow of flows) {
  try {
    const sent = await sendEmail(to, flow.subject, flow.html);
    results.push({ flow: flow.flow, sent: true, provider: sent.provider, messageId: sent.messageId, attempts: sent.attempts });
  } catch (error) {
    results.push({ flow: flow.flow, sent: false, error: error instanceof Error ? error.message : String(error) });
  }
}

const auth = createClient(
  localEnv.SUPABASE_URL || localEnv.VITE_SUPABASE_URL,
  localEnv.VITE_SUPABASE_ANON_KEY || localEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const reset = await auth.auth.resetPasswordForEmail(to, {
  redirectTo: "https://hello.tracksyra.com/reset-password",
});
results.push({
  flow: "password_reset",
  sent: !reset.error,
  provider: "supabase-auth",
  messageId: null,
  error: reset.error?.message || null,
});

const recent = await supabase
  .from("email_delivery_logs")
  .select("id,to_email,subject,status,error_message,provider_response,created_at")
  .eq("to_email", to)
  .order("created_at", { ascending: false })
  .limit(10);

console.log(JSON.stringify({
  ok: results.every((result) => result.sent),
  to,
  results,
  delivery_logs: recent.data || [],
  delivery_log_error: recent.error?.message || null,
}, null, 2));

if (results.some((result) => !result.sent)) process.exit(1);
