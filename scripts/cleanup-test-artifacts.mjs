import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
const supabase = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const patterns = ["qa-probe-%", "contact-qa-%", "password-reset-qa-%"];
const results = [];
for (const pattern of patterns) {
  results.push({
    table: "email_queue",
    pattern,
    result: await supabase.from("email_queue").delete().like("to_email", pattern),
  });
  results.push({
    table: "email_logs",
    pattern,
    result: await supabase.from("email_logs").delete().like("recipient_email", pattern),
  });
  results.push({
    table: "form_submissions",
    pattern,
    result: await supabase.from("form_submissions").delete().like("email", pattern),
  });
  results.push({
    table: "artist_requests",
    pattern,
    result: await supabase.from("artist_requests").delete().like("email", pattern),
  });
}

const errors = results
  .map(({ table, pattern, result }) => ({ table, pattern, error: result.error?.message || null }))
  .filter((row) => row.error);

console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
if (errors.length) process.exit(1);
