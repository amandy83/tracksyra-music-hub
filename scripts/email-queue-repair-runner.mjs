import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    process.env[key] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env");

const mode = process.argv[2] || "apply";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  if (mode === "inspect-role") {
    const result = await client.query(
      "select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='has_role'",
    );
    console.log(JSON.stringify(result.rows));
  } else if (mode === "inspect-digest") {
    const result = await client.query(
      "select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='digest' order by 1, 3",
    );
    console.log(JSON.stringify(result.rows));
  } else if (mode === "validate") {
    const tables = await client.query(
      `select table_schema, table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1::text[])
       order by table_name`,
      [["email_queue", "email_logs", "email_delivery_logs"]],
    );
    const functions = await client.query(
      `select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any($1::text[])
       order by p.proname, args`,
      [["queue_email", "enqueue_email_queue", "dequeue_email_queue"]],
    );
    const missingTables = ["email_queue", "email_logs", "email_delivery_logs"]
      .filter((name) => !tables.rows.some((row) => row.table_name === name));
    console.log(JSON.stringify({
      ok: missingTables.length === 0,
      tables: tables.rows,
      missingTables,
      functions: functions.rows,
    }, null, 2));
    if (missingTables.length) process.exitCode = 1;
  } else if (mode === "integration") {
    await client.query("begin");
    try {
      const requestId = crypto.randomUUID();
      const queued = await client.query(
        `select public.queue_email(
          $1, $2, $3, $4, $5::jsonb, $6, $7::uuid
        ) as id`,
        [
          "codex-email-queue-smoke@example.invalid",
          "Codex Smoke",
          "Email queue smoke test",
          "artist_request_pending",
          JSON.stringify({ name: "Codex Smoke", traceId: requestId, correlationId: requestId }),
          "artist_requests",
          requestId,
        ],
      );
      const id = queued.rows[0]?.id;
      const row = await client.query("select * from public.email_queue where id = $1", [id]);
      const legacy = await client.query(
        "select count(*)::int as count from public.email_logs where related_table = $1 and related_id = $2",
        ["artist_requests", requestId],
      );
      const dequeued = await client.query("select * from public.dequeue_email_queue(10) where id = $1", [id]);
      await client.query(
        "update public.email_queue set status = 'RETRYING', retry_count = retry_count + 1, scheduled_at = now(), last_error = $2 where id = $1",
        [id, "codex retry smoke"],
      );
      const retry = await client.query("select status, retry_count from public.email_queue where id = $1", [id]);
      await client.query(
        "update public.email_queue set status = 'FAILED', retry_count = max_retries + 1, last_error = $2 where id = $1",
        [id, "codex failed smoke"],
      );
      const failed = await client.query("select status, retry_count, max_retries from public.email_queue where id = $1", [id]);
      await client.query(
        `insert into public.email_delivery_logs (to_email, subject, status, provider_response, error_message)
         values ($1, $2, 'FAILED', $3::jsonb, $4)`,
        ["codex-email-queue-smoke@example.invalid", "Codex Smoke", JSON.stringify({ provider: "smoke" }), "codex failed smoke"],
      );
      const audit = await client.query(
        "select count(*)::int as count from public.email_delivery_logs where to_email = $1 and subject = $2",
        ["codex-email-queue-smoke@example.invalid", "Codex Smoke"],
      );

      console.log(JSON.stringify({
        ok: Boolean(id) &&
          row.rowCount === 1 &&
          legacy.rows[0]?.count === 1 &&
          dequeued.rowCount === 1 &&
          retry.rows[0]?.status === "RETRYING" &&
          failed.rows[0]?.status === "FAILED" &&
          audit.rows[0]?.count === 1,
        queued: { id, rowCount: row.rowCount, legacyLogCount: legacy.rows[0]?.count },
        dequeued: { rowCount: dequeued.rowCount, status: dequeued.rows[0]?.status },
        retry: retry.rows[0],
        failed: failed.rows[0],
        auditLogCount: audit.rows[0]?.count,
        rolledBack: true,
      }, null, 2));
    } finally {
      await client.query("rollback");
    }
  } else {
    const sql = readFileSync("supabase/migrations/20260528110000_email_queue_runtime_repair.sql", "utf8");
    await client.query(sql);
    console.log(JSON.stringify({ migration: { ok: true, file: "20260528110000_email_queue_runtime_repair.sql" } }));
  }
} finally {
  await client.end();
}
