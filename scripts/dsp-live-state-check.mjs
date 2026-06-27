import fs from "node:fs/promises";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const TABLES = [
  "dsp_release_readiness",
  "dsp_marketing_tasks",
  "dsp_pre_save_campaigns",
  "dsp_pre_save_events",
  "dsp_campaigns",
  "dsp_campaign_metrics",
  "dsp_analytics_snapshots",
  "dsp_audience_metrics",
  "dsp_ai_recommendations",
];
const DEPENDENCIES = ["releases"];

const env = await loadEnv(`${ROOT}/.env`);
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = env.DATABASE_URL;

const result = {
  generatedAt: new Date().toISOString(),
  supabaseUrl,
  hasAnonKey: Boolean(anonKey),
  hasServiceKey: Boolean(serviceKey),
  hasDatabaseUrl: Boolean(databaseUrl),
  rest: {},
  database: {},
  rls: {},
};

if (!supabaseUrl || !anonKey || !serviceKey) {
  result.error = "Missing required Supabase credentials in .env";
  await writeOutput(result);
  process.exitCode = 1;
  process.exit();
}

const restClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

for (const table of TABLES) {
  const response = await restClient.from(table).select("*");
  result.rest[table] = {
    exists: !response.error,
    status: response.error ? "FAIL" : "PASS",
    code: response.error?.code || null,
    message: response.error?.message || null,
    rowCount: response.error ? null : response.data?.length ?? null,
  };
}

result.dependencies = {};
for (const table of DEPENDENCIES) {
  const response = await restClient.from(table).select("*");
  result.dependencies[table] = {
    exists: !response.error,
    status: response.error ? "FAIL" : "PASS",
    code: response.error?.code || null,
    message: response.error?.message || null,
  };
}

if (databaseUrl) {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const existence = await client.query(
      `select c.relname as table_name, c.relkind as relkind, c.relrowsecurity as rls_enabled, coalesce(count(p.*), 0)::int as policy_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policy p on p.polrelid = c.oid
       where n.nspname = 'public'
         and c.relname = any($1)
       group by c.relname, c.relkind, c.relrowsecurity
       order by c.relname`,
      [TABLES],
    );
    const counts = {};
    for (const table of TABLES) {
      try {
        const countResult = await client.query(`select count(*)::int as count from public.${table}`);
        counts[table] = countResult.rows[0]?.count ?? null;
      } catch (error) {
        counts[table] = null;
      }
    }
    result.database.exists = existence.rows.reduce((acc, row) => {
      acc[row.table_name] = row.relkind === "r" || row.relkind === "p";
      return acc;
    }, {});
    result.database.rowCounts = counts;
    result.rls.rows = existence.rows;
    result.database.status = "PASS";
  } catch (error) {
    result.database.status = "FAIL";
    result.database.error = error.message;
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore disconnect errors when the initial connection never established.
    }
  }
}

await writeOutput(result);

async function writeOutput(payload) {
  await fs.mkdir(`${ROOT}/reports`, { recursive: true });
  await fs.writeFile(`${ROOT}/reports/dsp-live-state-check.json`, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

async function loadEnv(file) {
  try {
    const content = await fs.readFile(file, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}
