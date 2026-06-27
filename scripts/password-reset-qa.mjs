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

function redactUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|code|access|refresh/i.test(key)) url.searchParams.set(key, "<redacted>");
  }
  if (url.hash) url.hash = "#<redacted>";
  return url.toString();
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

const stamp = Date.now();
const email = `password-reset-qa-${stamp}@hello.tracksyra.com`;
const oldPassword = `OldPass-${stamp}!`;
const newPassword = `NewPass-${stamp}!`;
const redirectTo = "https://hello.tracksyra.com/reset-password";
const result = {
  ok: false,
  testUser: email,
  checks: [],
};

function add(name, ok, detail = {}) {
  result.checks.push({ name, ok, ...detail });
}

let userId;
try {
  const created = await admin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  add("test user creation", true);

  const invalidEmail = await anon.auth.resetPasswordForEmail("not-an-email", { redirectTo });
  add("email validation via Supabase API", Boolean(invalidEmail.error), {
    error: invalidEmail.error?.message || null,
  });

  const resetRequest = await anon.auth.resetPasswordForEmail(email, { redirectTo });
  add("reset request accepted", !resetRequest.error, {
    error: resetRequest.error?.message || null,
  });

  const spamAttempts = [];
  for (let i = 0; i < 8; i += 1) {
    const attempt = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    spamAttempts.push({ ok: !attempt.error, error: attempt.error?.message || null, status: attempt.error?.status || null });
  }
  add("rate limit / spam protection signal", spamAttempts.some((attempt) => !attempt.ok), {
    attempts: spamAttempts.map((attempt) => ({ ok: attempt.ok, status: attempt.status, error: attempt.error })),
  });

  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (link.error) throw link.error;
  const actionLink = link.data.properties.action_link;
  const actionUrl = new URL(actionLink);
  add("reset link generated", Boolean(actionLink), {
    url: redactUrl(actionLink),
    protocol: actionUrl.protocol,
    redirect_to: actionUrl.searchParams.get("redirect_to"),
    hasTokenHash: actionUrl.searchParams.has("token"),
    type: actionUrl.searchParams.get("type"),
  });
  add("reset link uses HTTPS", actionUrl.protocol === "https:", { protocol: actionUrl.protocol });

  const tokenHash = actionUrl.searchParams.get("token");
  const verify = await anon.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  add("token validation", !verify.error, { error: verify.error?.message || null });
  if (verify.error) throw verify.error;

  const update = await anon.auth.updateUser({ password: newPassword });
  add("password update success", !update.error, { error: update.error?.message || null });

  const oldLogin = await createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.signInWithPassword({ email, password: oldPassword });
  add("old password invalidated", Boolean(oldLogin.error), { error: oldLogin.error?.message || null });

  const newLoginClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const newLogin = await newLoginClient.auth.signInWithPassword({ email, password: newPassword });
  add("login with new password", !newLogin.error, { error: newLogin.error?.message || null });
  await newLoginClient.auth.signOut();

  const reuseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reuse = await reuseClient.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  add("token one-time-use", Boolean(reuse.error), { error: reuse.error?.message || null });

  const invalid = await createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.verifyOtp({
    type: "recovery",
    token_hash: "invalid-token",
  });
  add("invalid token rejected", Boolean(invalid.error), { error: invalid.error?.message || null });

  result.ok = result.checks.every((check) => check.ok);
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    add("test user cleanup", !deleted.error, { error: deleted.error?.message || null });
  }
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
