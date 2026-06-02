import { createHmac, timingSafeEqual } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../config/envLoader";

const trackedEvents = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
]);

const statusByEvent: Record<string, string> = {
  delivered: "DELIVERED",
  opened: "OPENED",
  clicked: "CLICKED",
  bounced: "BOUNCED",
  complained: "COMPLAINED",
};

export class ResendWebhookService {
  constructor(private supabase: SupabaseClient = createSupabaseAdminClient()) {}

  async handle(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    verifyResendSignature(rawBody, headers);
    const payload = JSON.parse(rawBody) as ResendWebhookPayload;
    if (!trackedEvents.has(payload.type)) return { ok: true, tracked: false };

    const eventType = payload.type.replace(/^email\./, "");
    const messageId = payload.data?.email_id || payload.data?.message_id;
    const recipients = recipientsFromPayload(payload);
    const eventTimestamp = timestampValue(payload.data?.[eventType]?.timestamp) || timestampValue(payload.created_at) || new Date().toISOString();

    for (const recipient of recipients) {
      const { error } = await this.supabase.from("email_events").insert({
        message_id: messageId,
        recipient,
        event_type: eventType,
        event_timestamp: eventTimestamp,
        raw_payload: payload as any,
      });
      if (error) throw new Error(`Failed to write email event: ${error.message}`);

      if (messageId) {
        await this.supabase
          .from("email_delivery_logs")
          .update({ status: statusByEvent[eventType] || eventType.toUpperCase() })
          .eq("message_id", messageId)
          .eq("to_email", recipient);
      }
    }

    return { ok: true, tracked: true, eventType, messageId, recipients: recipients.length };
  }
}

type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    to?: string[];
    [key: string]: any;
  };
};

function verifyResendSignature(rawBody: string, headers: Record<string, string | string[] | undefined>) {
  const secret = readEnv("RESEND_WEBHOOK_SECRET");
  if (!secret && readEnv("NODE_ENV") !== "production") return;
  if (!secret) throw httpError(401, "MISSING_RESEND_WEBHOOK_SECRET");

  const id = headerValue(headers, "svix-id");
  const timestamp = headerValue(headers, "svix-timestamp");
  const signature = headerValue(headers, "svix-signature");
  if (!id || !timestamp || !signature) throw httpError(401, "INVALID_RESEND_WEBHOOK_SIGNATURE");

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) throw httpError(401, "STALE_RESEND_WEBHOOK_SIGNATURE");

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  const valid = signature.split(" ").some((candidate) => {
    const encoded = candidate.includes(",") ? candidate.split(",")[1] : candidate;
    const actual = Buffer.from(encoded, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!valid) throw httpError(401, "INVALID_RESEND_WEBHOOK_SIGNATURE");
}

function recipientsFromPayload(payload: ResendWebhookPayload) {
  const recipients = payload.data?.to || [];
  return recipients.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
}

function timestampValue(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string) {
  const value = headers[key] || headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function createSupabaseAdminClient() {
  loadRuntimeEnv();
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("ResendWebhookService requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readEnv(name: string) {
  loadRuntimeEnv();
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env[name]
    : undefined;
}

function httpError(status: number, code: string) {
  const error = new Error(code) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
}
