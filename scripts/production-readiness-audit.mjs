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

function cleanResult(result) {
  return {
    data: result.data ?? null,
    error: result.error?.message || null,
    count: result.count ?? null,
  };
}

const env = loadEnv(".env");
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(JSON.stringify({ ok: false, error: "Missing Supabase URL, anon key, or service role key" }));
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const out = { ok: true };

const roleResult = await admin.from("user_roles").select("user_id,role").eq("role", "admin");
out.admin_roles = {
  count: roleResult.data?.length || 0,
  error: roleResult.error?.message || null,
};
out.admin_users = [];
for (const role of roleResult.data || []) {
  const user = await admin.auth.admin.getUserById(role.user_id);
  out.admin_users.push({
    id: role.user_id,
    email: user.data?.user?.email || null,
    confirmed: Boolean(user.data?.user?.email_confirmed_at),
    last_sign_in_at: user.data?.user?.last_sign_in_at || null,
    error: user.error?.message || null,
  });
}

out.form_submissions = cleanResult(await admin
  .from("form_submissions")
  .select("id,form_type,email,created_at,status", { count: "exact" })
  .limit(3));

out.artist_requests = cleanResult(await admin
  .from("artist_requests")
  .select("id,email,status,user_id,created_at", { count: "exact" })
  .limit(3));

out.smtp_settings = cleanResult(await admin
  .from("smtp_settings")
  .select("host,port,secure,username,from_email,from_name,is_active,updated_at")
  .eq("is_active", true)
  .limit(3));

out.email_queue = cleanResult(await admin
  .from("email_queue")
  .select("id,to_email,subject,status,retry_count,last_error,created_at")
  .order("created_at", { ascending: false })
  .limit(5));

out.email_delivery_logs = cleanResult(await admin
  .from("email_delivery_logs")
  .select("id,to_email,subject,status,error_message,created_at")
  .order("created_at", { ascending: false })
  .limit(5));

const probeEmail = `qa-probe-${Date.now()}@example.com`;
const insertProbe = await anon
  .from("form_submissions")
  .insert({
    form_type: "QA Probe",
    email: probeEmail,
    name: "QA Probe",
    phone: "+15555550199",
    data: { qa: true, source: "production-readiness-audit" },
  });
out.anon_insert_form_probe = {
  ok: !insertProbe.error,
  error: insertProbe.error?.message || null,
  email: probeEmail,
};

if (!insertProbe.error) {
  const cleanup = await admin.from("form_submissions").delete().eq("email", probeEmail);
  out.probe_cleanup = cleanup.error?.message || "deleted";
}

console.log(JSON.stringify(out, null, 2));
