import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const requestedTables = [
  "playlist_pitches",
  "playlist_pitch_notes",
  "curator_profiles",
  "curator_marketplace",
  "curator_assignments",
  "curator_quality_scores",
  "playlist_analytics",
  "playlist_reach_metrics",
];

const views = [
  "playlist_pitch_admin_queue",
  "playlist_pitch_artist_dashboard",
  "playlist_pitch_delivery_tracking",
  "free_playlist_pitch_admin_analytics",
  "curator_marketplace_playlist_cards",
  "curator_marketplace_admin_analytics",
];

const rpcs = [
  ["deliver_playlist_pitch_to_matched_curators", { p_pitch_id: "00000000-0000-0000-0000-000000000000", p_limit: 1 }],
  ["force_assign_playlist_pitch_curator", { p_pitch_id: "00000000-0000-0000-0000-000000000000", p_curator_id: "00000000-0000-0000-0000-000000000000", p_playlist_id: null, p_internal_notes: null }],
  ["record_curator_delivery_action", { p_delivery_id: "00000000-0000-0000-0000-000000000000", p_action: "opened" }],
  ["recalculate_playlist_pitch_analytics", { p_pitch_id: "00000000-0000-0000-0000-000000000000" }],
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local", "server/.env", "server/.env.local"]) {
    if (!existsSync(file)) continue;
    Object.assign(env, parseEnv(await readFile(file, "utf8")));
  }
  return env;
}

async function relationProbe(url, key, name) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${name}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({}));
  return { name, ok: response.ok, status: response.status, code: body.code ?? null, detail: body.message ?? response.statusText };
}

async function rpcProbe(url, key, name, body) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { name, ok: data.code !== "PGRST202", status: response.status, code: data.code ?? null, detail: data.message ?? response.statusText };
}

const env = await loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = new URL(url).hostname.replace(".supabase.co", "");

const tableResults = [];
for (const table of requestedTables) tableResults.push(await relationProbe(url, key, table));
const viewResults = [];
for (const view of views) viewResults.push(await relationProbe(url, key, view));
const rpcResults = [];
for (const [name, body] of rpcs) rpcResults.push(await rpcProbe(url, key, name, body));

const lines = [
  "# Playlist Pitching Post-Deployment Verification",
  "",
  "Final Status: FAIL",
  `Project: ${projectRef}`,
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Live Evidence",
  "",
  "- migration_execution: FAIL - Postgres connection reached Supabase but returned `password authentication failed for user \"postgres\"`; no SQL migrations were applied by this run.",
  ...tableResults.map((row) => `- table.${row.name}: ${row.ok ? "PASS" : "FAIL"} - ${row.code ?? row.status}: ${row.detail}`),
  ...viewResults.map((row) => `- view.${row.name}: ${row.ok ? "PASS" : "FAIL"} - ${row.code ?? row.status}: ${row.detail}`),
  ...rpcResults.map((row) => `- rpc.${row.name}: ${row.ok ? "PASS" : "FAIL"} - ${row.code ?? row.status}: ${row.detail}`),
  "- test_pitch_insert: FAIL - skipped because `playlist_pitches` is not available in the live schema.",
  "- curator_assignment: FAIL - skipped because delivery/assignment tables are not available in the live schema.",
  "- analytics_row_creation: FAIL - skipped because analytics tables/views are not available in the live schema.",
  "- dashboard_queries: FAIL - skipped because dashboard views are not available in the live schema.",
  "",
];

await mkdir("reports", { recursive: true });
await writeFile("reports/playlist-pitching-post-deployment-verification.md", `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ status: "FAIL", report: "reports/playlist-pitching-post-deployment-verification.md" }, null, 2));
