import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

function loadEnv(path) {
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(".env");
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const redirectTo = "https://hello.tracksyra.com/reset-password";
const stamp = Date.now();
const email = `password-reset-audit-${stamp}@hello.tracksyra.com`;

if (!supabaseUrl || !anonKey || !serviceRoleKey || !env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "Missing Supabase or DATABASE_URL configuration" }));
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pgClient = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const startedAt = new Date().toISOString();
let userId = null;
const result = {
  ok: false,
  startedAt,
  testEmail: email,
  redirectTo,
  steps: [],
  observations: {},
};

function step(name, ok, detail = {}) {
  result.steps.push({ name, ok, ...detail });
}

await pgClient.connect();
try {
  const created = await admin.auth.admin.createUser({
    email,
    password: `Audit-${stamp}!`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  step("temporary auth user created", true, { userId });

  const reset = await anon.auth.resetPasswordForEmail(email, { redirectTo });
  step("resetPasswordForEmail accepted", !reset.error, {
    error: reset.error?.message || null,
    status: reset.error?.status || null,
    providerResponseVisible: false,
    smtpResponseVisible: false,
    messageIdVisible: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const authUser = await pgClient.query(
    `select id, email, recovery_sent_at, recovery_token is not null as has_recovery_token
     from auth.users
     where id = $1`,
    [userId],
  );
  step("auth.users recovery metadata updated", Boolean(authUser.rows[0]?.recovery_sent_at), {
    row: authUser.rows[0] || null,
  });

  const deliveryLogs = await pgClient.query(
    `select id, to_email, subject, status, provider_response, error_message, created_at
     from public.email_delivery_logs
     where created_at >= $1
       and (subject ilike '%reset%' or provider_response::text ilike '%reset%')
     order by created_at desc`,
    [startedAt],
  );
  step("TrackSyra email_delivery_logs contains reset", deliveryLogs.rows.length > 0, {
    rows: deliveryLogs.rows,
  });

  const queueRows = await pgClient.query(
    `select id, to_email, subject, template_type, status, created_at
     from public.email_queue
     where created_at >= $1
       and (subject ilike '%reset%' or template_type ilike '%reset%')
     order by created_at desc`,
    [startedAt],
  );
  step("TrackSyra email_queue contains reset", queueRows.rows.length > 0, {
    rows: queueRows.rows,
  });

  const anyTracksyraRowsForUser = await pgClient.query(
    `select 'email_queue' as source, id::text, to_email, subject, status, created_at
     from public.email_queue
     where created_at >= $1 and to_email = $2
     union all
     select 'email_delivery_logs' as source, id::text, to_email, subject, status, created_at
     from public.email_delivery_logs
     where created_at >= $1 and to_email = $2
     order by created_at desc`,
    [startedAt, email],
  );
  step("TrackSyra rows for temporary user", anyTracksyraRowsForUser.rows.length > 0, {
    rows: anyTracksyraRowsForUser.rows,
    note: "Rows here can be non-reset side effects, such as welcome email queue entries from auth user creation.",
  });

  const auditRows = await pgClient.query(
    `select created_at, payload
     from auth.audit_log_entries
     where created_at >= $1
       and payload::text ilike any(array['%recover%', '%password%', '%reset%', $2])
     order by created_at desc
     limit 20`,
    [startedAt, `%${email}%`],
  );
  step("auth audit entries visible for reset", auditRows.rows.length > 0, {
    rows: auditRows.rows,
  });

  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  step("admin recovery link generation works", !link.error, {
    error: link.error?.message || null,
    actionLinkHost: link.data?.properties?.action_link ? new URL(link.data.properties.action_link).host : null,
    redirectTo: link.data?.properties?.redirect_to || null,
    emailOtpVisibleToServiceRole: Boolean(link.data?.properties?.email_otp),
    hashedTokenVisibleToServiceRole: Boolean(link.data?.properties?.hashed_token),
  });

  result.observations = {
    resetApiReturnsMessageId: false,
    resetApiReturnsSmtpResponse: false,
    resetApiReturnsProviderResponse: false,
    tracksyraSendEmailInvokedForReset: deliveryLogs.rows.length > 0 || queueRows.rows.length > 0,
  };
  result.ok = result.steps.find((item) => item.name === "resetPasswordForEmail accepted")?.ok === true &&
    result.steps.find((item) => item.name === "auth.users recovery metadata updated")?.ok === true;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    step("temporary auth user cleanup", !deleted.error, { error: deleted.error?.message || null });
  }
  await pgClient.end();
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
