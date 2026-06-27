import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const env = loadEnv(path.join(root, ".env"));
const reportPath = path.join(root, "reports", "too-lost-live-production-verification.md");
const evidence = {
  generatedAt: new Date().toISOString(),
  environment: {
    tooLostApiKeyPresent: Boolean(env.TOO_LOST_API_KEY),
    tooLostApiUrl: env.TOO_LOST_API_URL || "https://api.toolost.com",
    tooLostWebhookSecretPresent: Boolean(env.TOO_LOST_WEBHOOK_SECRET),
    supabaseUrlPresent: Boolean(env.SUPABASE_URL),
    supabaseServiceRolePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  },
  apiConnectivity: [],
  database: {},
  checks: [],
};

await run();

async function run() {
  await checkTooLostHealth();
  await checkTooLostAuthentication();
  await queryDatabase();
  addLiveCheckResults();
  writeReport();
}

async function checkTooLostHealth() {
  const baseUrl = trimTrailingSlash(env.TOO_LOST_API_URL || "https://api.toolost.com");
  await measuredFetch({
    name: "Too Lost health endpoint",
    method: "GET",
    url: `${baseUrl}/health`,
    headers: { Accept: "application/json" },
    redactHeaders: [],
  });
}

async function checkTooLostAuthentication() {
  const baseUrl = trimTrailingSlash(env.TOO_LOST_API_URL || "https://api.toolost.com");
  if (!env.TOO_LOST_API_KEY) {
    evidence.apiConnectivity.push({
      name: "Too Lost authenticated health",
      skipped: true,
      reason: "TOO_LOST_API_KEY is missing from .env.",
      request: { method: "GET", url: `${baseUrl}/health`, authHeaderPresent: false },
    });
    return;
  }

  await measuredFetch({
    name: "Too Lost authenticated health",
    method: "GET",
    url: `${baseUrl}/health`,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.TOO_LOST_API_KEY}`,
    },
    redactHeaders: ["authorization"],
  });
}

async function measuredFetch({ name, method, url, headers, redactHeaders }) {
  const started = performance.now();
  try {
    const response = await fetch(url, { method, headers });
    const responseText = await response.text();
    evidence.apiConnectivity.push({
      name,
      request: {
        method,
        url,
        headers: redactObject(headers, redactHeaders),
        authHeaderPresent: Boolean(headers.Authorization),
      },
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        responseTimeMs: Math.round(performance.now() - started),
        body: parseBody(responseText),
      },
    });
  } catch (error) {
    evidence.apiConnectivity.push({
      name,
      request: {
        method,
        url,
        headers: redactObject(headers, redactHeaders),
        authHeaderPresent: Boolean(headers.Authorization),
      },
      response: {
        ok: false,
        responseTimeMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function queryDatabase() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    evidence.database.skipped = true;
    evidence.database.reason = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.";
    return;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  evidence.database.distributionProvider = await safeSupabaseQuery(() =>
    supabase.from("distribution_providers").select("provider,display_name,is_enabled,sync_status,last_sync_at,updated_at").eq("provider", "too_lost").maybeSingle(),
  );
  evidence.database.recentJobs = await safeSupabaseQuery(() =>
    supabase.from("distribution_jobs").select("id,release_id,track_id,provider,platform,status,provider_job_id,failure_reason,retry_count,delivery_progress,release_health,created_at,updated_at").eq("provider", "too_lost").order("created_at", { ascending: false }).limit(5),
  );
  evidence.database.recentSyncLogs = await safeSupabaseQuery(() =>
    supabase.from("distribution_sync_logs").select("id,provider,release_id,track_id,distribution_job_id,sync_type,status,failure_reason,retry_count,created_at").eq("provider", "too_lost").order("created_at", { ascending: false }).limit(5),
  );
  evidence.database.recentEvents = await safeSupabaseQuery(() =>
    supabase.from("distribution_events").select("id,event_id,provider,event_type,release_id,track_id,platform,normalized_status,created_at").eq("provider", "too_lost").order("created_at", { ascending: false }).limit(5),
  );
  evidence.database.artistDashboard = await safeSupabaseQuery(() =>
    supabase.from("artist_distribution_dashboard").select("release_id,title,distribution_status,submission_date,dsp_status,delivery_progress,live_links,release_health,provider_delivery_status").limit(5),
  );
  evidence.database.adminDashboard = await safeSupabaseQuery(() =>
    supabase.from("admin_distribution_dashboard").select("*").maybeSingle(),
  );
}

async function safeSupabaseQuery(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { ok: false, error: error.message, details: error.details ?? null, hint: error.hint ?? null };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function addLiveCheckResults() {
  const blockedByMissingKey = !env.TOO_LOST_API_KEY;
  const liveChecks = [
    ["Release Submission Test", "Requires valid TOO_LOST_API_KEY and confirmed Too Lost release-submission sandbox/production endpoint."],
    ["Artwork Upload Test", "Requires valid TOO_LOST_API_KEY and provider artwork upload endpoint."],
    ["Audio Upload Test", "Requires valid TOO_LOST_API_KEY and provider audio upload endpoint."],
    ["Delivery Pipeline", "Requires a submitted provider release ID from Too Lost."],
    ["Webhook Verification", "Requires Too Lost webhook delivery or documented event replay endpoint."],
    ["Failure Recovery", "Requires live provider validation calls for invalid metadata, missing artwork, and duplicate ISRC."],
  ];

  for (const [name, blocker] of liveChecks) {
    evidence.checks.push({
      name,
      result: blockedByMissingKey ? "FAIL" : "NOT_RUN",
      reason: blockedByMissingKey ? "TOO_LOST_API_KEY is missing from .env." : blocker,
      blocker,
    });
  }
}

function writeReport() {
  const health = evidence.apiConnectivity.find((item) => item.name === "Too Lost health endpoint");
  const auth = evidence.apiConnectivity.find((item) => item.name === "Too Lost authenticated health");
  const dbOk = Object.values(evidence.database).some((value) => value && typeof value === "object" && value.ok === true);
  const apiReachable = Boolean(health?.response?.ok);
  const authOk = Boolean(auth?.response?.ok);
  const pass = apiReachable && authOk && dbOk && evidence.checks.every((check) => check.result === "PASS");
  const readinessScore = score({ apiReachable, authOk, dbOk });

  const markdown = `# Too Lost Live Production Verification

Date: 2026-06-23

## Final Verdict

${pass ? "PASS" : "FAIL"}

Readiness score: ${readinessScore}/100

## Credential State

| Credential | State |
| --- | --- |
| TOO_LOST_API_KEY | ${evidence.environment.tooLostApiKeyPresent ? "present" : "missing"} |
| TOO_LOST_API_URL | ${evidence.environment.tooLostApiUrl} |
| TOO_LOST_WEBHOOK_SECRET | ${evidence.environment.tooLostWebhookSecretPresent ? "present" : "missing"} |
| SUPABASE_URL | ${evidence.environment.supabaseUrlPresent ? "present" : "missing"} |
| SUPABASE_SERVICE_ROLE_KEY | ${evidence.environment.supabaseServiceRolePresent ? "present" : "missing"} |

## API Connectivity

\`\`\`json
${JSON.stringify(evidence.apiConnectivity, null, 2)}
\`\`\`

## Release Submission Test

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

Requested test release:

\`\`\`json
{
  "title": "TrackSyra Test Release",
  "artist": "TrackSyra Test Artist"
}
\`\`\`

No external release ID was returned because live Too Lost credentials are not configured.

## Artwork Upload Test

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

No artwork asset ID was returned because live Too Lost credentials are not configured.

## Audio Upload Test

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

No provider track ID was returned because live Too Lost credentials are not configured.

## Delivery Pipeline

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

No provider processing state could be observed without a submitted Too Lost release.

## Webhook Verification

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

Required events were not triggered against a live provider:

- approved
- rejected
- processing
- delivered
- live

## Dashboard Verification

Database-backed dashboard visibility evidence:

\`\`\`json
${JSON.stringify({
  artistDashboard: evidence.database.artistDashboard ?? null,
  adminDashboard: evidence.database.adminDashboard ?? null,
}, null, 2)}
\`\`\`

## Failure Recovery

Result: ${env.TOO_LOST_API_KEY ? "NOT RUN" : "FAIL"}

Invalid metadata, missing artwork, and duplicate ISRC tests require live Too Lost validation calls.

## Database Evidence

\`\`\`json
${JSON.stringify(evidence.database, null, 2)}
\`\`\`

## Blockers

- \`TOO_LOST_API_KEY\` is missing from \`.env\`.
- \`TOO_LOST_API_URL\` is missing from \`.env\`; default fallback was used for reachability only.
- \`TOO_LOST_WEBHOOK_SECRET\` is missing from \`.env\`, so live webhook signature verification cannot be validated.
- No actual Too Lost release ID, artwork asset ID, audio track ID, or webhook payload can be produced without provider credentials.

## Raw Evidence

\`\`\`json
${JSON.stringify(evidence, null, 2)}
\`\`\`
`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown);
  console.log(JSON.stringify({ verdict: pass ? "PASS" : "FAIL", readinessScore, reportPath }, null, 2));
}

function score({ apiReachable, authOk, dbOk }) {
  let value = 0;
  if (apiReachable) value += 15;
  if (authOk) value += 25;
  if (dbOk) value += 20;
  if (env.TOO_LOST_API_KEY) value += 10;
  if (env.TOO_LOST_WEBHOOK_SECRET) value += 10;
  if (evidence.checks.every((check) => check.result === "PASS")) value += 20;
  return value;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function redactObject(value, keys) {
  const redact = new Set(keys.map((key) => key.toLowerCase()));
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [key, redact.has(key.toLowerCase()) ? "[REDACTED]" : val]),
  );
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}
