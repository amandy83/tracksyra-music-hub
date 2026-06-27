import { readFileSync } from "node:fs";

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
const apiKey = env.RESEND_API_KEY || env.SMTP_PASSWORD || env.SMTP_PASS;
if (!apiKey) {
  console.error(JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY or SMTP_PASSWORD" }));
  process.exit(1);
}

const response = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const text = await response.text();
let body = text;
try {
  body = JSON.parse(text);
} catch {}

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  body,
}, null, 2));

if (!response.ok) process.exit(1);
