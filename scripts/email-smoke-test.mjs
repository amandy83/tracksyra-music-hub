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
const to = process.argv[2] || env.EMAIL_TEST_TO || env.ADMIN_EMAIL;
if (!to) {
  console.error(JSON.stringify({ ok: false, error: "Pass test recipient as first argument or set EMAIL_TEST_TO" }));
  process.exit(1);
}

const supabase = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const result = await supabase.functions.invoke("send-emails", {
  body: { test: true, to },
});

let contextBody = null;
if (result.error?.context && typeof result.error.context.text === "function") {
  contextBody = await result.error.context.text().catch(() => null);
}

console.log(JSON.stringify({
  ok: !result.error && !result.data?.error,
  data: result.data || null,
  error: result.error?.message || result.data?.error || null,
  status: result.error?.context?.status || null,
  context_body: contextBody,
}, null, 2));

if (result.error || result.data?.error) process.exit(1);
