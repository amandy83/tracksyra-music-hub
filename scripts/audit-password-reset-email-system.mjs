import { readFileSync } from "node:fs";
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

function mask(value) {
  if (!value) return null;
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-6)}` : "***";
}

const env = loadEnv(".env");
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const authTables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'auth'
    order by table_name
  `);

  const authConfigLikeTables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('auth', 'public')
      and (
        table_name ilike '%config%'
        or table_name ilike '%smtp%'
        or table_name ilike '%email%'
        or table_name ilike '%template%'
      )
    order by table_schema, table_name
  `);

  const authUsersColumns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name in (
        'email',
        'recovery_token',
        'recovery_sent_at',
        'email_confirmed_at',
        'confirmation_sent_at'
      )
    order by column_name
  `);

  const recentRecoveries = await client.query(`
    select id, email, recovery_sent_at, updated_at, last_sign_in_at
    from auth.users
    where recovery_sent_at is not null
    order by recovery_sent_at desc
    limit 10
  `);

  const targetRecovery = await client.query(`
    select id, email, recovery_sent_at, updated_at, last_sign_in_at
    from auth.users
    where lower(email) = lower($1)
    limit 1
  `, ["amandeepy95@gmail.com"]);

  const auditTables = authTables.rows.some((row) => row.table_name === "audit_log_entries");
  let recentAuthAudit = [];
  if (auditTables) {
    const audit = await client.query(`
      select created_at, payload
      from auth.audit_log_entries
      where payload::text ilike any(array['%recover%', '%password%', '%reset%'])
      order by created_at desc
      limit 20
    `);
    recentAuthAudit = audit.rows;
  }

  const publicSmtp = await maybeQuery(`
    select id, host, port, secure, username, from_email, from_name, is_active, updated_at
    from public.smtp_settings
    order by updated_at desc nulls last
    limit 5
  `);

  const deliveryResetLogs = await maybeQuery(`
    select id, to_email, subject, status, provider_response, error_message, created_at
    from public.email_delivery_logs
    where subject ilike '%reset%' or provider_response::text ilike '%reset%'
    order by created_at desc
    limit 20
  `);

  const emailQueueResetRows = await maybeQuery(`
    select id, to_email, subject, template_type, status, created_at, updated_at
    from public.email_queue
    where subject ilike '%reset%' or template_type ilike '%reset%' or html_content ilike '%reset%'
    order by created_at desc
    limit 20
  `);

  const emailLogsResetRows = await maybeQuery(`
    select id, recipient_email, subject, template, status, sent_at, created_at
    from public.email_logs
    where subject ilike '%reset%' or template ilike '%reset%'
    order by created_at desc
    limit 20
  `);

  const edgeFunctionsConfig = await maybeQuery(`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in ('email_template_html', 'queue_email', 'enqueue_email_queue')
    order by proname
  `);

  console.log(JSON.stringify({
    ok: true,
    env: {
      supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || null,
      hasSupabaseAccessToken: Boolean(env.SUPABASE_ACCESS_TOKEN),
      hasSupabaseProjectId: Boolean(env.SUPABASE_PROJECT_ID),
      emailProvider: env.EMAIL_PROVIDER || null,
      tracksyraSmtp: {
        host: env.SMTP_HOST || null,
        port: env.SMTP_PORT || null,
        secure: env.SMTP_SECURE || null,
        username: mask(env.SMTP_USERNAME || env.SMTP_USER),
        fromEmail: env.SMTP_FROM_EMAIL || env.EMAIL_FROM || null,
      },
      hasResendApiKey: Boolean(env.RESEND_API_KEY),
      smtpPasswordLooksLikeResendKey: /^re_/.test(env.SMTP_PASSWORD || env.SMTP_PASS || ""),
    },
    auth: {
      tables: authTables.rows,
      configLikeTables: authConfigLikeTables.rows,
      usersColumns: authUsersColumns.rows.map((row) => row.column_name),
      targetUserRecovery: targetRecovery.rows,
      recentRecoveries: recentRecoveries.rows,
      recentAuditRecoveryEvents: recentAuthAudit,
    },
    tracksyraEmailSystem: {
      smtpSettingsRows: publicSmtp,
      resetRowsInEmailDeliveryLogs: deliveryResetLogs,
      resetRowsInEmailQueue: emailQueueResetRows,
      resetRowsInEmailLogs: emailLogsResetRows,
      emailFunctions: edgeFunctionsConfig,
    },
  }, null, 2));
} finally {
  await client.end();
}

async function maybeQuery(sql) {
  try {
    const result = await client.query(sql);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return { ok: false, error: error.message, rows: [] };
  }
}
