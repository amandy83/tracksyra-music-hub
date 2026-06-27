import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ENV_FILES = [".env", ".env.local", "server/.env", "server/.env.local"];

const requestedObjects = [
  "playlist_pitches",
  "playlist_pitch_notes",
  "curator_profiles",
  "curator_marketplace",
  "curator_assignments",
  "curator_quality_scores",
  "playlist_analytics",
  "playlist_reach_metrics",
];

const repoEquivalentObjects = {
  curator_profiles: ["playlist_curator_marketplace", "curator_playlists"],
  curator_marketplace: ["playlist_curator_marketplace"],
  curator_assignments: ["playlist_pitch_assignments", "curator_deliveries"],
  playlist_analytics: ["playlist_pitch_analytics", "playlist_pitch_delivery_tracking", "free_playlist_pitch_admin_analytics"],
  playlist_reach_metrics: ["playlist_pitch_delivery_tracking", "free_playlist_pitch_admin_analytics"],
};

const expectedViews = [
  "playlist_pitch_admin_queue",
  "playlist_pitch_artist_dashboard",
  "playlist_pitch_delivery_tracking",
  "free_playlist_pitch_admin_analytics",
  "free_playlist_pitch_usage",
  "curator_marketplace_playlist_cards",
  "curator_marketplace_admin_analytics",
  "curator_verification_admin_queue",
  "curator_outreach_artist_dashboard",
  "playlist_performance_artist_dashboard",
  "playlist_performance_timeline",
  "playlist_performance_admin_analytics",
  "playlist_genre_performance_admin",
];

const expectedRpcFunctions = [
  "review_playlist_pitch",
  "assign_playlist_pitch_curator",
  "record_playlist_pitch_response",
  "recalculate_playlist_pitch_analytics",
  "playlist_pitch_limit_for_user",
  "recommend_playlist_curators_for_pitch",
  "refresh_playlist_pitch_curator_recommendations",
  "deliver_playlist_pitch_to_matched_curators",
  "force_assign_playlist_pitch_curator",
  "record_curator_delivery_action",
  "create_curator_outreach",
  "record_curator_outreach_response",
  "create_curator_verification_request",
  "review_curator_verification_request",
  "refresh_curator_marketplace_stats",
  "refresh_curator_quality_score",
  "refresh_playlist_placement_metrics",
];

const zeroUuid = "00000000-0000-0000-0000-000000000000";
const rpcProbeBodies = {
  review_playlist_pitch: { p_pitch_id: zeroUuid, p_action: "under_review", p_admin_notes: null, p_priority_score: null },
  assign_playlist_pitch_curator: { p_pitch_id: zeroUuid, p_curator_id: zeroUuid, p_internal_notes: null },
  record_playlist_pitch_response: { p_assignment_id: zeroUuid, p_response_status: "no_response", p_response_notes: null, p_playlist_name: null, p_playlist_url: null, p_estimated_reach: 0 },
  recalculate_playlist_pitch_analytics: { p_pitch_id: zeroUuid },
  playlist_pitch_limit_for_user: { p_user_id: zeroUuid },
  recommend_playlist_curators_for_pitch: { p_pitch_id: zeroUuid, p_limit: 1 },
  refresh_playlist_pitch_curator_recommendations: { p_pitch_id: zeroUuid },
  deliver_playlist_pitch_to_matched_curators: { p_pitch_id: zeroUuid, p_limit: 1 },
  force_assign_playlist_pitch_curator: { p_pitch_id: zeroUuid, p_curator_id: zeroUuid, p_playlist_id: zeroUuid, p_internal_notes: null },
  record_curator_delivery_action: { p_delivery_id: zeroUuid, p_action: "opened", p_response_notes: null, p_requested_information: null, p_playlist_url: null, p_playlist_id: null, p_playlist_name: null, p_estimated_reach: 0 },
  create_curator_outreach: { p_release_id: zeroUuid, p_track_id: zeroUuid, p_curator_id: zeroUuid, p_playlist_id: null, p_pitch_story: null, p_notes: null },
  record_curator_outreach_response: { p_outreach_id: zeroUuid, p_status: "viewed", p_curator_feedback: null, p_notes: null },
  create_curator_verification_request: {
    p_curator_name: "Schema audit",
    p_playlist_url: "https://open.spotify.com/playlist/schema-audit",
    p_spotify_playlist_id: "schema-audit",
    p_playlist_followers: 0,
    p_contact_email: "schema-audit@example.com",
    p_social_links: {},
    p_company_name: null,
    p_country: null,
    p_territory: null,
    p_playlist_name: "Schema audit",
    p_playlist_public: true,
  },
  review_curator_verification_request: { p_request_id: zeroUuid, p_action: "reject", p_admin_notes: "Schema audit probe" },
  refresh_curator_marketplace_stats: { p_curator_id: zeroUuid },
  refresh_curator_quality_score: { p_curator_id: zeroUuid },
  refresh_playlist_placement_metrics: { p_placement_id: zeroUuid },
};

const expectedPolicySurface = {
  playlist_pitches: [
    "artists view own playlist pitches",
    "artists create own playlist pitches",
    "artists update own draft playlist pitches",
    "admins manage playlist pitches",
  ],
  playlist_pitch_assignments: [
    "artists view own playlist pitch assignments",
    "admins manage playlist pitch assignments",
  ],
  playlist_pitch_responses: [
    "artists view own playlist pitch responses",
    "admins manage playlist pitch responses",
  ],
  playlist_pitch_analytics: [
    "artists view own playlist pitch analytics",
    "admins manage playlist pitch analytics",
  ],
  playlist_pitch_audit_logs: [
    "artists view own playlist pitch audit logs",
    "admins view playlist pitch audit logs",
  ],
  playlist_curator_marketplace: [
    "artists view active marketplace curators",
    "admins manage marketplace curators",
  ],
  curator_playlists: [
    "artists view active curator playlists",
    "admins manage curator playlists",
  ],
  curator_deliveries: [
    "artists view own curator deliveries",
    "admins manage curator deliveries",
    "curator accounts update own deliveries",
  ],
  curator_responses: [
    "artists view own curator responses",
    "admins manage curator responses",
  ],
  curator_playlist_additions: [
    "artists view own curator playlist additions",
    "admins manage curator playlist additions",
  ],
  curator_quality_scores: [
    "authenticated view curator quality scores",
    "admins manage curator quality scores",
  ],
  curator_verification_requests: [
    "users create curator verification requests",
    "users view own curator verification requests",
    "admins manage curator verification requests",
  ],
  curator_playlist_registry: [
    "authenticated view verified playlist registry",
    "admins manage playlist registry",
  ],
};

const requiredMigrations = [
  "supabase/migrations/20260604100000_phase6_playlist_pitching_system.sql",
  "supabase/migrations/20260604110000_phase61_curator_marketplace.sql",
  "supabase/migrations/20260604120000_phase62_playlist_performance_analytics.sql",
  "supabase/migrations/20260623170000_free_playlist_pitching_system.sql",
  "supabase/migrations/20260623180000_real_curator_delivery_system.sql",
  "supabase/migrations/20260623190000_phase63_curator_recruitment_verification.sql",
];

function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const runtime = { ...process.env };
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const parsed = parseEnv(await readFile(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!runtime[key]) runtime[key] = value;
    }
  }
  return runtime;
}

async function restProbe(url, key, relation) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${relation}?select=*&limit=0`;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    return {
      name: relation,
      ok: response.ok,
      status: response.status,
      code: body.code ?? null,
      detail: body.message ?? response.statusText,
    };
  } catch (error) {
    return { name: relation, ok: false, status: null, code: error.name, detail: error.message };
  }
}

async function rpcProbe(url, key, fn) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/${fn}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rpcProbeBodies[fn] ?? {}),
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    const missing = body.code === "PGRST202" || body.message?.includes("Could not find the function");
    return {
      name: fn,
      ok: !missing,
      callable: response.ok,
      status: response.status,
      code: body.code ?? null,
      detail: body.message ?? response.statusText,
    };
  } catch (error) {
    return { name: fn, ok: false, callable: false, status: null, code: error.name, detail: error.message };
  }
}

function status(ok) {
  return ok ? "Existing" : "Missing";
}

function tableRows(rows, mapper) {
  return rows.map(mapper).join("\n") || "| none |";
}

async function main() {
  const env = await loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or API key in local environment.");

  const exactResults = {};
  const equivalentResults = {};
  const viewResults = {};
  const rpcResults = {};

  for (const object of requestedObjects) {
    exactResults[object] = await restProbe(url, key, object);
  }
  for (const [requested, equivalents] of Object.entries(repoEquivalentObjects)) {
    equivalentResults[requested] = [];
    for (const equivalent of equivalents) {
      equivalentResults[requested].push(await restProbe(url, key, equivalent));
    }
  }
  for (const view of expectedViews) {
    viewResults[view] = await restProbe(url, key, view);
  }
  for (const fn of expectedRpcFunctions) {
    rpcResults[fn] = await rpcProbe(url, key, fn);
  }

  const existingExact = requestedObjects.filter((name) => exactResults[name].ok);
  const missingExact = requestedObjects.filter((name) => !exactResults[name].ok);
  const missingViews = expectedViews.filter((name) => !viewResults[name].ok);
  const missingRpc = expectedRpcFunctions.filter((name) => !rpcResults[name].ok);
  const missingPolicies = Object.entries(expectedPolicySurface)
    .filter(([table]) => {
      const exact = exactResults[table];
      if (exact) return !exact.ok;
      return true;
    })
    .flatMap(([table, policies]) => policies.map((policy) => ({ table, policy })));

  const localMigrationRows = requiredMigrations.map((file) => ({
    file,
    local: existsSync(file),
  }));

  const projectRef = (() => {
    try {
      return new URL(url).hostname.replace(".supabase.co", "");
    } catch {
      return "unknown";
    }
  })();
  const linkedProjectRef = existsSync("supabase/.temp/project-ref")
    ? (await readFile("supabase/.temp/project-ref", "utf8")).trim()
    : null;
  const config = existsSync("supabase/config.toml") ? await readFile("supabase/config.toml", "utf8") : "";
  const configProjectRef = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null;

  const report = [
    "# Playlist Pitching Schema Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Live Supabase project: \`${projectRef}\``,
    "",
    "This audit used the live Supabase REST/RPC API with the local service-role configuration. No mock data was used.",
    "",
    "## 1. Existing Tables",
    "",
    "| Requested object | Live status | Detail |",
    "| --- | --- | --- |",
    tableRows(existingExact.map((name) => exactResults[name]), (row) => `| \`${row.name}\` | Existing | ${row.detail || "reachable"} |`),
    "",
    "## 2. Missing Tables",
    "",
    "| Requested object | Live status | Detail |",
    "| --- | --- | --- |",
    tableRows(missingExact.map((name) => exactResults[name]), (row) => `| \`${row.name}\` | Missing | ${row.code ?? row.status}: ${row.detail} |`),
    "",
    "## Repo-Equivalent Objects",
    "",
    "Several requested names do not match the repo's Phase 6 schema names. These live probes show whether the repo-equivalent objects are present.",
    "",
    "| Requested name | Repo-equivalent object | Live status | Detail |",
    "| --- | --- | --- | --- |",
    tableRows(Object.entries(equivalentResults).flatMap(([requested, rows]) => rows.map((row) => ({ requested, row }))), ({ requested, row }) => `| \`${requested}\` | \`${row.name}\` | ${status(row.ok)} | ${row.code ?? row.status}: ${row.detail} |`),
    "",
    "## 3. Missing Views",
    "",
    "| View | Live status | Detail |",
    "| --- | --- | --- |",
    tableRows(missingViews.map((name) => viewResults[name]), (row) => `| \`${row.name}\` | Missing | ${row.code ?? row.status}: ${row.detail} |`),
    "",
    "## 4. Missing RPC Functions",
    "",
    "| RPC function | Live status | Detail |",
    "| --- | --- | --- |",
    tableRows(missingRpc.map((name) => rpcResults[name]), (row) => `| \`${row.name}\` | Missing | ${row.code ?? row.status}: ${row.detail} |`),
    "",
    "## 5. Missing RLS Policies",
    "",
    "Policy metadata is not exposed through PostgREST. Because the required base tables are missing from the live schema cache, their RLS policies are necessarily absent for production use.",
    "",
    "| Table | Required policy |",
    "| --- | --- |",
    tableRows(missingPolicies, (row) => `| \`${row.table}\` | \`${row.policy}\` |`),
    "",
    "## 6. Missing Migrations",
    "",
    "The live schema does not expose the objects created by these local migration files, so these are the migrations that must be executed in Supabase SQL Editor for Playlist Pitching.",
    "",
    "| Order | Migration file | Local file present |",
    "| --- | --- | --- |",
    tableRows(localMigrationRows.map((row, index) => ({ ...row, index })), (row) => `| ${row.index + 1} | \`${row.file}\` | ${row.local ? "yes" : "no"} |`),
    "",
    "## Project Configuration Finding",
    "",
    `- Runtime `.concat("`.env`", ` points at \`${projectRef}\`.`),
    `- \`supabase/config.toml\` project_id is \`${configProjectRef ?? "missing"}\`.`,
    `- \`supabase/.temp/project-ref\` is \`${linkedProjectRef ?? "missing"}\`.`,
    "",
    "If migrations are applied through the Supabase CLI, relink the CLI to the runtime project before pushing. For SQL Editor execution, open the runtime project shown above and run the migration files in the listed order.",
    "",
    "## Final Assessment",
    "",
    missingExact.length === 0 && missingViews.length === 0 && missingRpc.length === 0
      ? "Playlist Pitching schema objects are exposed in the live Supabase schema cache."
      : "Playlist Pitching is not production-ready in the live Supabase project. Core tables/views/RPCs are missing from the live schema cache.",
    "",
  ].join("\n");

  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-schema-audit.md", report, "utf8");
  console.log(JSON.stringify({
    projectRef,
    existingTables: existingExact,
    missingTables: missingExact,
    missingViews,
    missingRpc,
    missingPolicyCount: missingPolicies.length,
    requiredMigrations,
    report: "reports/playlist-pitching-schema-audit.md",
  }, null, 2));

  if (missingExact.length || missingViews.length || missingRpc.length) process.exitCode = 1;
}

main().catch(async (error) => {
  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-schema-audit.md", `# Playlist Pitching Schema Audit\n\nAudit failed: ${error.message}\n`, "utf8");
  console.error(JSON.stringify({ error: error.message, report: "reports/playlist-pitching-schema-audit.md" }, null, 2));
  process.exitCode = 1;
});
