import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION_FILE = "supabase/migrations/20260601053000_branded_email_templates.sql";
const MIGRATION_VERSION = "20260601053000";
const MIGRATION_NAME = "branded_email_templates";

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
if (!env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL is required" }));
  process.exit(1);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const before = await verify();
  let appliedNow = false;
  let registryUpdate = { attempted: false, inserted: false, error: null };

  if (!before.active) {
    const sql = readFileSync(MIGRATION_FILE, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      registryUpdate = await recordMigration(sql);
      await client.query("commit");
      appliedNow = true;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  }

  const after = await verify();
  console.log(JSON.stringify({
    ok: after.active,
    migration: MIGRATION_FILE,
    appliedNow,
    before,
    after,
    registryUpdate,
  }, null, 2));
  if (!after.active) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
} finally {
  await client.end();
}

async function verify() {
  const registry = await migrationRegistryStatus();
  const functions = await client.query(`
    select
      to_regprocedure('public.email_brand_layout(text,text,text,text)') is not null as email_brand_layout,
      to_regprocedure('public.email_template_html(text,jsonb)') is not null as email_template_html,
      to_regprocedure('public.notify_contact_form_insert()') is not null as notify_contact_form_insert
  `);
  const trigger = await client.query(`
    select exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'form_submissions'
        and t.tgname = 'form_submissions_contact_notification_email'
        and not t.tgisinternal
    ) as exists
  `);
  const sampleTemplates = [
    ["welcome", { name: "Amandeep" }],
    ["artist_request_approved", { name: "Amandeep", artist_id: "QA-ARTIST" }],
    ["artist_request_rejected", { name: "Amandeep", notes: "QA rejection reason" }],
    ["form_approved", { name: "Amandeep", form_type: "Publisher Inquiry" }],
    ["form_rejected", { name: "Amandeep", form_type: "Publisher Inquiry", notes: "QA rejection reason" }],
    ["contact_form_notification", { name: "Amandeep", email: "amandeepy95@gmail.com", form_type: "Publisher Inquiry" }],
    ["admin_notification", { message: "QA admin event" }],
  ];
  const samples = [];
  for (const [template, payload] of sampleTemplates) {
    const result = await client.query(
      "select public.email_template_html($1, $2::jsonb) as html",
      [template, JSON.stringify(payload)],
    );
    const html = result.rows[0].html || "";
    samples.push({
      template,
      branded: html.includes('data-tracksyra-email="branded"'),
      hasHeader: html.includes("TrackSyra") && html.includes("Music Distribution Platform"),
      hasResponsiveMeta: html.includes('name="viewport"'),
      hasUserName: template.includes("admin") || template.includes("contact_form")
        ? html.includes("Hi Admin")
        : html.includes("Amandeep"),
      hasCta: /<a href="(?:https:\/\/hello\.tracksyra\.com|mailto:support@tracksyra\.com)/.test(html),
      hasFooter: html.includes("Need help?") && html.includes("Copyright") && html.includes("All rights reserved"),
    });
  }

  const functionRow = functions.rows[0];
  const allFunctions = Object.values(functionRow).every(Boolean);
  const allSamples = samples.every((sample) =>
    sample.branded &&
    sample.hasHeader &&
    sample.hasResponsiveMeta &&
    sample.hasUserName &&
    sample.hasCta &&
    sample.hasFooter
  );

  return {
    active: allFunctions && trigger.rows[0].exists && allSamples,
    registry,
    functions: functionRow,
    contactNotificationTrigger: trigger.rows[0].exists,
    samples,
  };
}

async function migrationRegistryStatus() {
  const table = await client.query(`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'supabase_migrations'
        and table_name = 'schema_migrations'
    ) as exists
  `);
  if (!table.rows[0].exists) return { tableExists: false, rowExists: false };
  const row = await client.query(
    "select exists (select 1 from supabase_migrations.schema_migrations where version = $1) as exists",
    [MIGRATION_VERSION],
  );
  return { tableExists: true, rowExists: row.rows[0].exists };
}

async function recordMigration(sql) {
  const registry = await migrationRegistryStatus();
  if (!registry.tableExists || registry.rowExists) {
    return { attempted: false, inserted: false, error: null };
  }

  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
    order by ordinal_position
  `);
  const names = columns.rows.map((row) => row.column_name);
  const insertColumns = ["version"];
  const values = [MIGRATION_VERSION];

  if (names.includes("name")) {
    insertColumns.push("name");
    values.push(MIGRATION_NAME);
  }
  if (names.includes("statements")) {
    insertColumns.push("statements");
    values.push([sql]);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  try {
    await client.query(
      `insert into supabase_migrations.schema_migrations (${insertColumns.join(", ")}) values (${placeholders})`,
      values,
    );
    return { attempted: true, inserted: true, error: null };
  } catch (error) {
    return { attempted: true, inserted: false, error: error.message };
  }
}
