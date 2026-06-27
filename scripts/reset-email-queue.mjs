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

const { data, error } = await supabase
  .from("email_queue")
  .update({
    status: "PENDING",
    retry_count: 0,
    last_error: null,
    scheduled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .in("status", ["RETRYING", "FAILED", "PROCESSING"])
  .select("id,to_email,subject,status");

if (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, reset: data || [] }, null, 2));
