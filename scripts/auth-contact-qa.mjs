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

function add(result, name, ok, detail = {}) {
  result.checks.push({ name, ok, ...detail });
}

const env = { ...loadEnv(".env"), ...(readFileSync(".admin-credentials.local", "utf8") && loadEnv(".admin-credentials.local")) };
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const result = { ok: false, checks: [] };
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const storage = new Map();
const authClient = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  },
});

const login = await authClient.auth.signInWithPassword({
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD,
});
add(result, "admin sign-in", !login.error, { error: login.error?.message || null });

let adminUserId = login.data.user?.id;
if (adminUserId) {
  const role = await authClient
    .from("user_roles")
    .select("role")
    .eq("user_id", adminUserId)
    .eq("role", "admin")
    .maybeSingle();
  add(result, "admin role visible to authenticated user", Boolean(role.data) && !role.error, {
    error: role.error?.message || null,
  });

  const session = await authClient.auth.getSession();
  add(result, "session persistence", Boolean(session.data.session?.access_token), {
    error: session.error?.message || null,
  });

  const forms = await authClient.from("form_submissions").select("id").limit(1);
  add(result, "admin can read form submissions", !forms.error, { error: forms.error?.message || null });

  const artists = await authClient.from("artist_requests").select("id").limit(1);
  add(result, "admin can read artist requests", !artists.error, { error: artists.error?.message || null });
}

const contactEmail = `contact-qa-${Date.now()}@example.com`;
const contact = await createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}).from("form_submissions").insert({
  form_type: "Publisher Inquiry",
  email: contactEmail,
  name: "QA Contact",
  phone: "+15555550101",
  data: {
    email: contactEmail,
    phone: "+15555550101",
    firstName: "QA",
    lastName: "Contact",
    country: "United States",
    city: "New York",
    artistName: "QA Artist",
    role: "Artist",
    genre: "Pop",
    workingWithPublisher: "No",
    catalogueSize: "1 - 10 songs",
    privateLink: "https://example.com/private-demo",
    streamingPlatform: "Spotify",
    monthlyListeners: "0 - 1K",
    privacyAccepted: true,
  },
});
add(result, "anonymous contact insert", !contact.error, { error: contact.error?.message || null });

const stored = await adminClient
  .from("form_submissions")
  .select("id,form_type,email,name,status,data")
  .eq("email", contactEmail)
  .maybeSingle();
add(result, "contact stored in database", Boolean(stored.data) && !stored.error, {
  error: stored.error?.message || null,
  status: stored.data?.status || null,
});

const update = stored.data?.id
  ? await authClient.from("form_submissions").update({ status: "approved", admin_notes: "QA approval test" }).eq("id", stored.data.id)
  : { error: new Error("No stored contact row") };
add(result, "admin contact status update", !update.error, { error: update.error?.message || null });

if (stored.data?.id) {
  const queued = await adminClient
    .from("email_logs")
    .select("id,recipient_email,template,status")
    .eq("related_id", stored.data.id);
  add(result, "contact status email queued", !queued.error && (queued.data?.length || 0) > 0, {
    error: queued.error?.message || null,
    count: queued.data?.length || 0,
  });
}

if (stored.data?.id) {
  await adminClient.from("email_logs").delete().eq("related_id", stored.data.id);
  await adminClient.from("form_submissions").delete().eq("id", stored.data.id);
}
await authClient.auth.signOut();

result.ok = result.checks.every((check) => check.ok);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
