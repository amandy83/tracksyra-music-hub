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
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const tables = await client.query(
    `select table_schema, table_name
     from information_schema.tables
     where table_schema in ('auth', 'public')
       and (
         table_name ilike '%config%'
         or table_name ilike '%audit%'
         or table_name ilike '%smtp%'
         or table_name ilike '%email%'
       )
     order by 1, 2`,
  );
  const authUsersColumns = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'auth'
       and table_name = 'users'
       and column_name in ('recovery_token', 'recovery_sent_at', 'email_confirmed_at', 'encrypted_password')
     order by column_name`,
  );
  console.log(JSON.stringify({
    tables: tables.rows,
    authUsersColumns: authUsersColumns.rows.map((row) => row.column_name),
  }, null, 2));
} finally {
  await client.end();
}
