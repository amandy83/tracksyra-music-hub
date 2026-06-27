import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Env = Record<string, string>;

function loadEnvFile(path: string): Env {
  if (!existsSync(path)) return {};
  const env: Env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function findUserByEmail(supabase: ReturnType<typeof createClient>, email: string) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users: ${error.message}`);

    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
const env = { ...fileEnv, ...process.env } as Env;

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const email = env.SUPER_ADMIN_EMAIL?.trim();
const password = env.SUPER_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, null, 2));
  process.exit(1);
}

if (!email || !password) {
  console.error(JSON.stringify({ ok: false, error: "Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD" }, null, 2));
  process.exit(1);
}

if (password.length < 8) {
  console.error(JSON.stringify({ ok: false, error: "SUPER_ADMIN_PASSWORD must be at least 8 characters" }, null, 2));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let user = await findUserByEmail(supabase, email);
let created = false;

if (!user) {
  const response = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "TrackSyra Super Admin",
      artist_name: "Super Admin",
    },
    app_metadata: {
      role: "super_admin",
    },
  });
  if (response.error) throw new Error(`Failed to create auth user: ${response.error.message}`);
  user = response.data.user;
  created = true;
}

const userId = user.id;

const profile = await supabase.from("profiles").upsert(
  {
    id: userId,
    full_name: user.user_metadata?.full_name || "TrackSyra Super Admin",
    artist_name: user.user_metadata?.artist_name || "Super Admin",
  },
  { onConflict: "id" },
);
if (profile.error) throw new Error(`Failed to upsert profile: ${profile.error.message}`);

const role = await supabase.from("user_roles").upsert(
  { user_id: userId, role: "super_admin" },
  { onConflict: "user_id,role" },
);
if (role.error) throw new Error(`Failed to assign super_admin role: ${role.error.message}`);

const legacyRoleCleanup = await supabase
  .from("user_roles")
  .delete()
  .eq("user_id", userId)
  .eq("role", "admin" as never);
if (legacyRoleCleanup.error) throw new Error(`Failed to remove legacy admin role: ${legacyRoleCleanup.error.message}`);

const { data: roleRows, error: roleVerifyError } = await supabase.from("user_roles").select("user_id,role").eq("user_id", userId);
if (roleVerifyError) throw new Error(`Failed to verify role after setup: ${roleVerifyError.message}`);
const hasSuperAdminRole = (roleRows || []).some((r) => r.role === "super_admin");
if (!hasSuperAdminRole) throw new Error("Role assignment failed: super_admin role not found after setup");

console.log("Super Admin Ready");
console.log(
  JSON.stringify(
    {
      ok: true,
      created,
      user: {
        id: userId,
        email: user.email,
        confirmed: Boolean(user.email_confirmed_at),
        role: "super_admin",
      },
    },
    null,
    2,
  ),
);
