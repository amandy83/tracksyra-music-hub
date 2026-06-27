import { readFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";

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

function requireValue(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  throw new Error(`Missing ${names.join(" or ")}`);
}

const env = loadEnv(".env");
const to = process.argv[2] || env.EMAIL_TEST_TO || env.ADMIN_EMAIL;
if (!to) {
  console.error(JSON.stringify({ ok: false, error: "Pass test recipient as first argument or set EMAIL_TEST_TO" }));
  process.exit(1);
}

try {
  const info = await send(env, to);
  console.log(JSON.stringify({ ok: true, ...info }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || null,
    responseCode: error.responseCode || null,
    message: error.message,
  }, null, 2));
  process.exit(1);
}

async function send(env, to) {
  const host = requireValue(env, ["SMTP_HOST"]);
  const port = Number(requireValue(env, ["SMTP_PORT"]));
  const username = requireValue(env, ["SMTP_USERNAME", "SMTP_USER"]);
  const password = requireValue(env, ["SMTP_PASSWORD", "SMTP_PASS"]);
  const fromEmail = requireValue(env, ["SMTP_FROM_EMAIL", "EMAIL_FROM"]);
  const fromName = env.SMTP_FROM_NAME || "TrackSyra Team";
  const secure = env.SMTP_SECURE === "true" || port === 465;
  const socket = secure
    ? tls.connect({ host, port, servername: host, timeout: 15000 })
    : net.connect({ host, port, timeout: 15000 });
  const reader = createSmtpReader(socket);
  await reader.expect(220);
  await reader.command(`EHLO ${env.SMTP_EHLO_DOMAIN || "localhost"}`, 250);
  if (!secure && reader.lastText.includes("STARTTLS")) {
    await reader.command("STARTTLS", 220);
  }
  const auth = Buffer.from(`\0${username}\0${password}`, "utf8").toString("base64");
  await reader.command(`AUTH PLAIN ${auth}`, 235);
  await reader.command(`MAIL FROM:<${fromEmail}>`, 250);
  await reader.command(`RCPT TO:<${to}>`, [250, 251]);
  await reader.command("DATA", 354);
  const messageId = `<smtp-test-${Date.now()}@${fromEmail.split("@")[1]}>`;
  socket.write([
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    "Subject: [TrackSyra] SMTP production smoke test",
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "This is a TrackSyra production-readiness SMTP smoke test.",
    ".",
    "",
  ].join("\r\n"));
  const accepted = await reader.expect(250);
  await reader.command("QUIT", 221).catch(() => undefined);
  socket.end();
  return {
    host,
    port,
    secure,
    from: fromEmail,
    to,
    messageId,
    provider_response: accepted.text.replace(/\s+/g, " ").trim(),
  };
}

function createSmtpReader(socket) {
  let buffer = "";
  const waiters = [];
  const state = { lastText: "" };
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    drain();
  });
  socket.on("error", (error) => {
    while (waiters.length) waiters.shift().reject(error);
  });
  socket.on("timeout", () => {
    const error = new Error("SMTP connection timed out");
    error.code = "ETIMEDOUT";
    socket.destroy(error);
  });

  function drain() {
    const response = takeResponse();
    if (!response || !waiters.length) return;
    state.lastText = response.text;
    waiters.shift().resolve(response);
    drain();
  }

  function takeResponse() {
    const lines = buffer.split(/\r?\n/);
    if (lines.length < 2) return null;
    const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));
    if (completeIndex === -1) return null;
    const responseLines = lines.slice(0, completeIndex + 1);
    buffer = lines.slice(completeIndex + 1).join("\n");
    const last = responseLines[responseLines.length - 1];
    return { code: Number(last.slice(0, 3)), text: responseLines.join("\n") };
  }

  async function next() {
    const response = takeResponse();
    if (response) {
      state.lastText = response.text;
      return response;
    }
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }

  async function expect(codes) {
    const acceptedCodes = Array.isArray(codes) ? codes : [codes];
    const response = await next();
    if (!acceptedCodes.includes(response.code)) throw smtpError(response);
    return response;
  }

  async function command(value, codes) {
    socket.write(`${value}\r\n`);
    return expect(codes);
  }

  return Object.assign(state, { expect, command });
}

function smtpError(response) {
  const error = new Error(response.text.replace(/\s+/g, " ").trim());
  error.responseCode = response.code;
  return error;
}
