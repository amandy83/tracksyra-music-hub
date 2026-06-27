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

const env = loadEnv(".env");
const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"];
const missing = required.filter((name) => !env[name]);
if (missing.length) {
  console.error(JSON.stringify({ ok: false, missing }));
  process.exit(1);
}

try {
  await verifySmtp(env);
  console.log(JSON.stringify({
    ok: true,
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USERNAME,
    from: env.SMTP_FROM_EMAIL || env.EMAIL_FROM || null,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || null,
    responseCode: error.responseCode || null,
    command: error.command || null,
    message: error.message,
  }));
  process.exit(1);
}

async function verifySmtp(env) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT);
  const secure = env.SMTP_SECURE === "true";
  const socket = secure
    ? tls.connect({ host, port, servername: host, timeout: 15000 })
    : net.connect({ host, port, timeout: 15000 });

  const reader = createSmtpReader(socket);
  await reader.expect(220);
  await reader.command(`EHLO ${env.SMTP_EHLO_DOMAIN || "localhost"}`, 250);
  const auth = Buffer.from(`\0${env.SMTP_USERNAME}\0${env.SMTP_PASSWORD}`, "utf8").toString("base64");
  await reader.command(`AUTH PLAIN ${auth}`, 235);
  await reader.command("QUIT", 221).catch(() => undefined);
  socket.end();
}

function createSmtpReader(socket) {
  let buffer = "";
  const waiters = [];
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
    const waiter = waiters.shift();
    waiter.resolve(response);
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
    if (response) return response;
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }

  async function expect(code) {
    const response = await next();
    if (response.code !== code) throw smtpError(response);
    return response;
  }

  async function command(value, code) {
    socket.write(`${value}\r\n`);
    return expect(code);
  }

  return { expect, command };
}

function smtpError(response) {
  const error = new Error(response.text.replace(/\s+/g, " ").trim());
  error.responseCode = response.code;
  return error;
}
