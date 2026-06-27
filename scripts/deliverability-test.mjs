import { readFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";

const FROM = "noreply@hello.tracksyra.com";
const TO = "amandeepy95@gmail.com";
const SUBJECT = "TrackSyra Deliverability Test";

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

try {
  const env = loadEnv(".env");
  const result = await send(env);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || null,
    responseCode: error.responseCode || null,
    message: error.message,
    smtpLogs: error.smtpLogs || [],
  }, null, 2));
  process.exit(1);
}

async function send(env) {
  const host = requireValue(env, ["SMTP_HOST"]);
  const port = Number(requireValue(env, ["SMTP_PORT"]));
  const username = requireValue(env, ["SMTP_USERNAME", "SMTP_USER"]);
  const password = requireValue(env, ["SMTP_PASSWORD", "SMTP_PASS"]);
  const fromName = env.SMTP_FROM_NAME || "TrackSyra Team";
  const secure = env.SMTP_SECURE === "true" || port === 465;
  const logs = [];
  const timestamp = new Date().toISOString();
  const messageId = `<tracksyra-deliverability-${Date.now()}@hello.tracksyra.com>`;

  let socket = secure
    ? tls.connect({ host, port, servername: host, timeout: 20000 })
    : net.connect({ host, port, timeout: 20000 });
  let reader = createSmtpReader(socket, logs);

  try {
    await reader.expect(220);
    const ehlo = await reader.command(`EHLO ${env.SMTP_EHLO_DOMAIN || "hello.tracksyra.com"}`, 250);
    if (!secure && /\bSTARTTLS\b/i.test(ehlo.text)) {
      await reader.command("STARTTLS", 220);
      socket.removeAllListeners("data");
      socket = tls.connect({ socket, servername: host, timeout: 20000 });
      reader = createSmtpReader(socket, logs);
      await onceSecure(socket);
      await reader.command(`EHLO ${env.SMTP_EHLO_DOMAIN || "hello.tracksyra.com"}`, 250);
    }

    const auth = Buffer.from(`\0${username}\0${password}`, "utf8").toString("base64");
    await reader.command(`AUTH PLAIN ${auth}`, 235, "AUTH PLAIN [redacted]");
    await reader.command(`MAIL FROM:<${FROM}>`, 250);
    await reader.command(`RCPT TO:<${TO}>`, [250, 251]);
    await reader.command("DATA", 354);

    socket.write([
      `From: ${fromName} <${FROM}>`,
      `To: ${TO}`,
      `Subject: ${SUBJECT}`,
      `Date: ${new Date(timestamp).toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      "This is a plain-text TrackSyra deliverability test email.",
      "",
      `Sending timestamp: ${timestamp}`,
      `Message-ID: ${messageId}`,
      ".",
      "",
    ].join("\r\n"));
    logs.push({ direction: "C", text: "[message data redacted: plain-text deliverability test body]" });
    const accepted = await reader.expect(250);
    await reader.command("QUIT", 221).catch(() => undefined);
    socket.end();

    return {
      host,
      port,
      secure: secure || logs.some((entry) => entry.direction === "C" && entry.text === "STARTTLS"),
      from: FROM,
      to: TO,
      subject: SUBJECT,
      sendingTimestamp: timestamp,
      messageId,
      smtpResponse: accepted.text.replace(/\s+/g, " ").trim(),
      smtpLogs: logs,
    };
  } catch (error) {
    error.smtpLogs = logs;
    socket.destroy();
    throw error;
  }
}

function onceSecure(socket) {
  if (socket.authorized || socket.encrypted) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
}

function createSmtpReader(socket, logs) {
  let buffer = "";
  const waiters = [];
  let lastText = "";
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
    lastText = response.text;
    logs.push({ direction: "S", code: response.code, text: response.text.replace(/\s+/g, " ").trim() });
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
      lastText = response.text;
      logs.push({ direction: "S", code: response.code, text: response.text.replace(/\s+/g, " ").trim() });
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

  async function command(value, codes, logValue = value) {
    logs.push({ direction: "C", text: logValue });
    socket.write(`${value}\r\n`);
    return expect(codes);
  }

  return {
    get lastText() {
      return lastText;
    },
    expect,
    command,
  };
}

function smtpError(response) {
  const error = new Error(response.text.replace(/\s+/g, " ").trim());
  error.responseCode = response.code;
  return error;
}
