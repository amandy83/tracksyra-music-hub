import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../config/envLoader";
import { createJobTrace, type EmailJob } from "../queue/jobTypes";
import { enqueueWithDefaults } from "../queue/queueFactory";
import { incrementMetric, setMetric } from "../queue/metrics";
import { queueNames } from "../queue/queueNames";

export type EmailQueueStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "RETRYING";

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  template_type: string;
  payload?: Record<string, unknown>;
  scheduled_at?: Date | string;
  max_retries?: number;
};

export type EmailQueueRow = {
  id: string;
  to_email: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  template_type: string;
  payload: Record<string, unknown>;
  status: EmailQueueStatus;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  deduplication_key: string;
};

let supabaseClient: SupabaseClient | null = null;

export async function enqueueEmail(input: EnqueueEmailInput): Promise<EmailQueueRow> {
  const payload = input.payload || {};
  const templateType = normalizeTemplateType(input.template_type);
  const deduplicationKey = createDeduplicationKey(input.to, templateType, payload);
  const scheduledAt = input.scheduled_at instanceof Date ? input.scheduled_at.toISOString() : input.scheduled_at;

  const { data, error } = await getSupabaseClient()
    .from("email_queue")
    .upsert(
      {
        to_email: input.to,
        subject: input.subject,
        html_content: input.html,
        text_content: input.text || null,
        template_type: templateType,
        payload,
        max_retries: input.max_retries ?? 3,
        deduplication_key: deduplicationKey,
        scheduled_at: scheduledAt || new Date().toISOString(),
      },
      { onConflict: "deduplication_key" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to enqueue email: ${error.message}`);
  const row = data as EmailQueueRow;
  await enqueueEmailJob(row);
  return row;
}

export async function enqueueEmailJob(row: EmailQueueRow) {
  const trace = createJobTrace({
    traceId: stringValue(row.payload.traceId) || row.id,
    correlationId: stringValue(row.payload.correlationId) || row.id,
    actorUserId: stringValue(row.payload.actorUserId),
    sourceSystem: "onboarding",
    createdAt: row.created_at,
    idempotencyKey: row.deduplication_key || `email:${row.id}`,
  });

  const job: EmailJob = {
    ...trace,
    emailQueueId: row.id,
    to: row.to_email,
    subject: row.subject,
    html: row.html_content,
    text: row.text_content,
    templateType: row.template_type,
    payload: row.payload || {},
  };

  return enqueueWithDefaults(queueNames.email, "email.send", job, {
    jobId: `email:${row.id}:${row.retry_count}`,
    attempts: Math.max(row.max_retries - row.retry_count + 1, 1),
    backoff: { type: "exponential", delay: 1000 },
  });
}

export async function dispatchPendingEmailQueue(limit = 100): Promise<number> {
  await refreshEmailQueueDiagnostics();
  const depth = await readPendingQueueDepth();
  if (depth < 0) return 0;
  setMetric("tracksyra_email_queue_depth", { state: "pending" }, depth);

  const rows = await dequeuePendingEmailRows(limit);
  setMetric("tracksyra_email_queue_depth", { state: "dequeued" }, rows.length);
  incrementMetric("tracksyra_email_dispatch_total", { status: "dequeued" }, rows.length);
  await Promise.all(rows.map((row) => enqueueEmailJob(row)));
  return rows.length;
}

export async function validateEmailQueueSchema() {
  const requiredTables = ["email_queue", "email_logs", "email_delivery_logs"] as const;
  const results = await Promise.all(requiredTables.map(async (table) => {
    const { error } = await getSupabaseClient().from(table).select("id", { head: true }).limit(1);
    return { table: `public.${table}`, exists: !error, error: error?.message || null };
  }));
  return {
    ok: results.every((result) => result.exists),
    tables: results,
  };
}

export async function refreshEmailQueueDiagnostics() {
  const statuses: EmailQueueStatus[] = ["PENDING", "RETRYING", "PROCESSING", "FAILED", "SENT"];
  const results = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await getSupabaseClient()
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", status);

    if (error && isMissingSchemaError(error.message)) {
      setMetric("tracksyra_email_queue_schema_ready", {}, 0);
      return { status, count: 0, error };
    }
    if (error) throw new Error(`Failed to read email queue ${status} metrics: ${error.message}`);
    return { status, count: count || 0, error: null };
  }));

  for (const result of results) {
    setMetric("tracksyra_email_queue_depth", { state: result.status.toLowerCase() }, result.count);
  }
  setMetric("tracksyra_email_failed_depth", { source: "email_queue" }, results.find((result) => result.status === "FAILED")?.count || 0);
  setMetric("tracksyra_email_retry_depth", { source: "email_queue" }, results.find((result) => result.status === "RETRYING")?.count || 0);
}

async function dequeuePendingEmailRows(limit: number): Promise<EmailQueueRow[]> {
  const rpcResult = await getSupabaseClient().rpc("dequeue_email_queue", { p_limit: limit });
  if (!rpcResult.error) return (rpcResult.data || []) as EmailQueueRow[];
  if (!isMissingSchemaError(rpcResult.error.message)) {
    throw new Error(`Failed to dequeue pending emails: ${rpcResult.error.message}`);
  }

  const { data, error } = await getSupabaseClient()
    .from("email_queue")
    .select("*")
    .in("status", ["PENDING", "RETRYING"])
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to dispatch pending emails: ${error.message}`);
  return (data || []) as EmailQueueRow[];
}

async function readPendingQueueDepth(): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["PENDING", "RETRYING"])
    .lte("scheduled_at", new Date().toISOString());
  if (error && isMissingSchemaError(error.message)) {
    setMetric("tracksyra_email_queue_schema_ready", {}, 0);
    incrementMetric("tracksyra_email_dispatch_total", { status: "schema_missing" });
    return -1;
  }
  if (error) throw new Error(`Failed to read email queue depth: ${error.message}`);
  setMetric("tracksyra_email_queue_schema_ready", {}, 1);
  return count || 0;
}

export function getSupabaseClient() {
  loadRuntimeEnv();
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Email queue requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return supabaseClient;
}

function createDeduplicationKey(to: string, templateType: string, payload: Record<string, unknown>) {
  const entityId =
    stringValue(payload.artist_request_id) ||
    stringValue(payload.related_id) ||
    stringValue(payload.user_id) ||
    stringValue(payload.id) ||
    stableJson(payload);

  return createHash("sha256")
    .update(`${to.toLowerCase()}|${templateType}|${entityId}`)
    .digest("hex");
}

function normalizeTemplateType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "artist_request_pending" || normalized === "artist_pending") return "ARTIST_PENDING";
  if (normalized === "artist_request_approved" || normalized === "artist_approved") return "ARTIST_APPROVED";
  if (normalized === "welcome") return "WELCOME_EMAIL";
  return value.trim().toUpperCase();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function isMissingSchemaError(message: string) {
  return /function .*dequeue_email_queue|schema cache|does not exist|not found/i.test(message);
}

function readEnv(name: string) {
  loadRuntimeEnv();
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env[name]
    : undefined;
}
