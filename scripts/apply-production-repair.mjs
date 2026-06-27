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

const env = loadEnv(".env");
if (!env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL is required" }));
  process.exit(1);
}

const sql = readFileSync("supabase/migrations/20260531120000_auth_contact_admin_repair.sql", "utf8");
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(JSON.stringify({ ok: true, migration: "20260531120000_auth_contact_admin_repair.sql" }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
} finally {
  await client.end();
}
