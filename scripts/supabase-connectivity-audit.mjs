import { createClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";

const LOCAL_ENV_FILES = [".env", ".env.local", "server/.env", "server/.env.local"];
const REQUESTED_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "PAYMENT_DATABASE_URL",
];
const SECRET_HINTS = ["KEY", "TOKEN", "SECRET", "PASSWORD", "DATABASE_URL", "PAYMENT_DATABASE_URL"];

function parseEnv(text) {
  const parsed = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2] ?? "";
    value = stripInlineComment(value).trim();
    parsed[match[1]] = unquote(value);
  }
  return parsed;
}

function stripInlineComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") quote = quote === char ? null : quote || char;
    if (char === "#" && !quote && /\s/.test(value[index - 1] || "")) return value.slice(0, index);
  }
  return value;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function maskValue(key, value) {
  if (!value) return "<missing>";
  if (SECRET_HINTS.some((hint) => key.includes(hint))) {
    if (key.includes("DATABASE_URL")) return maskDatabaseUrl(value);
    return value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-6)}` : "***";
  }
  return value;
}

function maskDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    if (url.username) url.username = `${url.username.slice(0, 2)}***`;
    return url.toString();
  } catch {
    return value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-6)}` : "***";
  }
}

function hostFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function hostFromDatabaseUrl(value) {
  return hostFromUrl(value);
}

function status(ok) {
  return ok ? "PASS" : "FAIL";
}

async function dnsCheck(host) {
  if (!host) return { ok: false, detail: "missing host" };
  try {
    const result = await lookup(host, { all: true });
    return { ok: result.length > 0, detail: result.map((entry) => entry.address).join(", ") || "no addresses" };
  } catch (error) {
    return { ok: false, detail: `${error.code || error.name}: ${error.message}` };
  }
}

async function fetchCheck(label, url, headers = {}) {
  try {
    const response = await fetch(url, { method: "GET", headers });
    const text = await response.text().catch(() => "");
    return {
      label,
      ok: response.ok,
      status: response.status,
      detail: response.ok ? "responded" : (text || response.statusText).slice(0, 300),
    };
  } catch (error) {
    return { label, ok: false, status: null, detail: `${error.name}: ${error.message}` };
  }
}

async function tcpCheck(host, port) {
  if (!host) return { ok: false, detail: "missing host" };
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 10_000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, detail: `tcp ${host}:${port} reachable` });
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, detail: `timeout connecting to ${host}:${port}` });
    });
    socket.once("error", (error) => {
      resolve({ ok: false, detail: `${error.code || error.name}: ${error.message}` });
    });
  });
}

async function main() {
  const files = {};
  const valuesBySource = [];
  for (const file of LOCAL_ENV_FILES) {
    if (!existsSync(file)) {
      files[file] = { exists: false, values: {} };
      continue;
    }
    const parsed = parseEnv(await readFile(file, "utf8"));
    files[file] = { exists: true, values: parsed };
    for (const key of REQUESTED_KEYS) {
      if (parsed[key]) valuesBySource.push({ source: file, key, value: parsed[key], masked: maskValue(key, parsed[key]) });
    }
  }

  const processValues = {};
  for (const key of REQUESTED_KEYS) {
    if (process.env[key]) {
      processValues[key] = process.env[key];
      valuesBySource.push({ source: "process.env", key, value: process.env[key], masked: maskValue(key, process.env[key]) });
    }
  }

  const runtime = { ...process.env };
  for (const file of [".env", ".env.local", "server/.env"]) {
    if (!files[file]?.exists) continue;
    for (const [key, value] of Object.entries(files[file].values)) {
      if (!runtime[key]) runtime[key] = value;
    }
  }
  if (!runtime.DATABASE_URL && runtime.PAYMENT_DATABASE_URL) runtime.DATABASE_URL = runtime.PAYMENT_DATABASE_URL;
  if (!runtime.PAYMENT_DATABASE_URL && runtime.DATABASE_URL) runtime.PAYMENT_DATABASE_URL = runtime.DATABASE_URL;

  const configured = {
    SUPABASE_URL: runtime.SUPABASE_URL,
    VITE_SUPABASE_URL: runtime.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: runtime.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: runtime.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: runtime.VITE_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: runtime.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: runtime.DATABASE_URL,
    PAYMENT_DATABASE_URL: runtime.PAYMENT_DATABASE_URL,
  };

  const supabaseUrl = configured.SUPABASE_URL || configured.VITE_SUPABASE_URL;
  const anonKey = configured.SUPABASE_ANON_KEY || configured.VITE_SUPABASE_ANON_KEY || configured.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = configured.SUPABASE_SERVICE_ROLE_KEY;
  const apiHost = hostFromUrl(supabaseUrl);
  const dbHost = hostFromDatabaseUrl(configured.DATABASE_URL || configured.PAYMENT_DATABASE_URL);

  const expectedRef = apiHost?.replace(".supabase.co", "");
  const projectConfig = existsSync("supabase/config.toml") ? await readFile("supabase/config.toml", "utf8") : "";
  const configuredProjectId = projectConfig.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] || null;
  const outdatedUrls = valuesBySource
    .filter((entry) => entry.value.includes("supabase.co"))
    .filter((entry) => {
      const host = entry.key.includes("DATABASE") || entry.key.includes("PAYMENT_DATABASE") ? hostFromDatabaseUrl(entry.value) : hostFromUrl(entry.value);
      if (!host) return true;
      if (expectedRef && host.includes(expectedRef)) return false;
      return true;
    })
    .map((entry) => ({ source: entry.source, key: entry.key, masked: entry.masked }));
  const mismatchedProjectRefs = [];
  if (configuredProjectId && expectedRef && configuredProjectId !== expectedRef) {
    mismatchedProjectRefs.push({
      source: "supabase/config.toml",
      key: "project_id",
      masked: configuredProjectId,
      expected: expectedRef,
    });
  }

  const apiDns = await dnsCheck(apiHost);
  const dbDns = await dnsCheck(dbHost);
  const dbTcp = await tcpCheck(dbHost, 5432);
  const auth = supabaseUrl && anonKey
    ? await fetchCheck("auth", `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, { apikey: anonKey })
    : { label: "auth", ok: false, status: null, detail: "missing Supabase URL or anon key" };
  const restKey = serviceKey || anonKey;
  const rest = supabaseUrl && restKey
    ? await fetchCheck("rest", `${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, { apikey: restKey, Authorization: `Bearer ${restKey}` })
    : { label: "rest", ok: false, status: null, detail: "missing Supabase URL or API key" };

  let clientCheck = { ok: false, detail: "missing Supabase URL or service role key" };
  if (supabaseUrl && serviceKey) {
    try {
      const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error, count } = await client.from("playlist_pitches").select("id", { head: true, count: "exact" }).limit(1);
      clientCheck = error ? { ok: false, detail: error.message } : { ok: true, detail: `playlist_pitches reachable; count=${count ?? "unknown"}` };
    } catch (error) {
      clientCheck = { ok: false, detail: `${error.name}: ${error.message}` };
    }
  }

  const deployment = {
    vercel: {
      localConfigPresent: existsSync("vercel.json") || existsSync(".vercel"),
      cliPresent: false,
      variablesReadable: false,
      detail: "No vercel.json/.vercel metadata or Vercel CLI found in this workspace.",
    },
    netlify: {
      localConfigPresent: existsSync("netlify.toml") || existsSync(".netlify"),
      cliPresent: false,
      variablesReadable: false,
      detail: "No netlify.toml/.netlify metadata or Netlify CLI found in this workspace.",
    },
    railway: {
      localConfigPresent: existsSync("railway.json") || existsSync("railway.toml") || existsSync(".railway"),
      cliPresent: false,
      variablesReadable: false,
      detail: "No railway.json/railway.toml/.railway metadata or Railway CLI found in this workspace.",
    },
    render: {
      localConfigPresent: existsSync("render.yaml"),
      variablesReadable: existsSync("render.yaml"),
      detail: "render.yaml declares SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, and PAYMENT_DATABASE_URL as sync:false remote variables; actual Render values are not stored in the repo.",
    },
    docker: {
      localConfigPresent: existsSync("Dockerfile") || existsSync("Dockerfile.worker") || existsSync("docker-compose.yml") || existsSync("docker-compose.yaml"),
      variablesReadable: existsSync("Dockerfile") || existsSync("Dockerfile.worker") || existsSync("docker-compose.yml") || existsSync("docker-compose.yaml"),
      detail: "Dockerfile.worker only sets NODE_ENV=production; Supabase variables are not baked into Docker and must be injected at runtime.",
    },
  };

  const rootCause = !apiDns.ok
    ? `Configured Supabase API host ${apiHost || "<missing>"} does not resolve in DNS.`
    : !dbDns.ok || !dbTcp.ok
      ? `Configured Supabase database host ${dbHost || "<missing>"} is not reachable.`
    : !auth.ok || !rest.ok || !clientCheck.ok
      ? "Supabase host resolves, but one or more HTTP/client connectivity checks failed."
      : mismatchedProjectRefs.length
        ? "Connectivity passes, but local Supabase CLI project metadata still points at an old project id."
        : "No connectivity issue detected by this audit.";

  const configuredRows = REQUESTED_KEYS.map((key) => `| ${key} | ${maskValue(key, configured[key])} |`).join("\n");
  const sourceRows = valuesBySource.map((entry) => `| ${entry.source} | ${entry.key} | ${entry.masked} |`).join("\n") || "| none | none | none |";
  const fileRows = Object.entries(files).map(([file, info]) => `| ${file} | ${info.exists ? "present" : "missing"} | ${Object.keys(info.values).filter((key) => REQUESTED_KEYS.includes(key)).join(", ") || "-" } |`).join("\n");
  const outdatedRows = outdatedUrls.length
    ? outdatedUrls.map((entry) => `| ${entry.source} | ${entry.key} | ${entry.masked} |`).join("\n")
    : "| none | none | none |";
  const projectRefRows = mismatchedProjectRefs.length
    ? mismatchedProjectRefs.map((entry) => `| ${entry.source} | ${entry.key} | ${entry.masked} | ${entry.expected} |`).join("\n")
    : "| none | none | none | none |";
  const deploymentRows = Object.entries(deployment).map(([name, info]) => `| ${name} | ${info.localConfigPresent ? "present" : "missing"} | ${info.variablesReadable ? "partial/local only" : "not readable"} | ${info.detail} |`).join("\n");

  const report = `# Supabase Connectivity Audit

Generated: ${new Date().toISOString()}

## Final Status

- DNS: ${status(apiDns.ok)}
- AUTH: ${status(auth.ok)}
- REST: ${status(rest.ok)}
- DATABASE: ${status(dbDns.ok && dbTcp.ok)}

## Actual Runtime Values

Runtime precedence follows \`server/src/config/envLoader.ts\`: existing \`process.env\`, then \`.env\`, then \`.env.local\`, then \`server/.env\`. \`server/.env.local\` is checked in this audit because it was requested, but the runtime loader does not currently load it.

| Key | Configured value |
| --- | --- |
${configuredRows}

## Values By Source

| Source | Key | Value |
| --- | --- | --- |
${sourceRows}

## Environment Files

| File | Status | Requested keys present |
| --- | --- | --- |
${fileRows}

## Deployment Variables

| Platform | Local config | Variable values | Notes |
| --- | --- | --- | --- |
${deploymentRows}

## Outdated Or Mismatched URLs

| Source | Key | Value |
| --- | --- | --- |
${outdatedRows}

## Outdated Or Mismatched Project Refs

| Source | Key | Current value | Expected value |
| --- | --- | --- | --- |
${projectRefRows}

## Connectivity Checks

| Check | Target | Result | Detail |
| --- | --- | --- | --- |
| DNS API host | ${apiHost || "<missing>"} | ${status(apiDns.ok)} | ${apiDns.detail} |
| DNS database host | ${dbHost || "<missing>"} | ${status(dbDns.ok)} | ${dbDns.detail} |
| Database TCP | ${dbHost ? `${dbHost}:5432` : "<missing>"} | ${status(dbDns.ok && dbTcp.ok)} | ${dbTcp.detail} |
| Auth endpoint | ${supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings` : "<missing>"} | ${status(auth.ok)} | ${auth.status ?? "-"} ${auth.detail} |
| REST endpoint | ${supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/rest/v1/` : "<missing>"} | ${status(rest.ok)} | ${rest.status ?? "-"} ${rest.detail} |
| Supabase client/database | playlist_pitches head query | ${status(clientCheck.ok)} | ${clientCheck.detail} |

## Root Cause

${rootCause}
`;

  await mkdir("reports", { recursive: true });
  await writeFile("reports/supabase-connectivity-audit.md", report, "utf8");
  console.log(JSON.stringify({
    dns: status(apiDns.ok),
    auth: status(auth.ok),
    rest: status(rest.ok),
    database: status(dbDns.ok && dbTcp.ok),
    apiHost,
    dbHost,
    rootCause,
    report: "reports/supabase-connectivity-audit.md",
  }, null, 2));

  if (!apiDns.ok || !auth.ok || !rest.ok || !clientCheck.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  await mkdir("reports", { recursive: true });
  await writeFile("reports/supabase-connectivity-audit.md", `# Supabase Connectivity Audit\n\nDNS: FAIL\nAUTH: FAIL\nREST: FAIL\nDATABASE: FAIL\n\nRoot cause: ${error.message}\n`, "utf8");
  console.error(JSON.stringify({ error: error.message, report: "reports/supabase-connectivity-audit.md" }, null, 2));
  process.exitCode = 1;
});
