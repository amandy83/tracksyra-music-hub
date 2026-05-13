// SMTP email dispatcher — reads pending email_logs, sends via nodemailer, retries on failure.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import nodemailer from "npm:nodemailer@6.9.14";
import { renderTemplate } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { test, to, log_id } = body;

  // Load active SMTP settings (admin can also override via env)
  const { data: smtp } = await supabase
    .from("smtp_settings")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const host = smtp?.host || Deno.env.get("SMTP_HOST");
  const port = smtp?.port || Number(Deno.env.get("SMTP_PORT") || 587);
  const secure = smtp?.secure ?? (port === 465);
  const user = smtp?.username || Deno.env.get("SMTP_USER");
  const pass = smtp?.password || Deno.env.get("SMTP_PASS");
  const fromName = smtp?.from_name || "TrackSyra";
  const fromEmail = smtp?.from_email || user;

  if (!host || !user || !pass) {
    return new Response(JSON.stringify({ error: "SMTP not configured" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });

  // Test mode
  if (test && to) {
    try {
      const { html, text } = renderTemplate("test", { name: "Admin" });
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to, subject: "TrackSyra SMTP test ✓", html, text,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Process queue: either a specific log_id or all pending
  let query = supabase.from("email_logs").select("*").lt("attempts", MAX_ATTEMPTS);
  query = log_id ? query.eq("id", log_id) : query.eq("status", "pending");
  const { data: logs } = await query.limit(50);

  let sent = 0, failed = 0;
  for (const log of logs || []) {
    try {
      const { html, text } = renderTemplate(log.template, log.template_data || {});
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: log.recipient_email,
        subject: log.subject,
        html, text,
      });
      await supabase.from("email_logs").update({
        status: "sent", sent_at: new Date().toISOString(),
        attempts: (log.attempts || 0) + 1, error_message: null,
      }).eq("id", log.id);
      sent++;
    } catch (e: any) {
      const attempts = (log.attempts || 0) + 1;
      await supabase.from("email_logs").update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts, error_message: e.message,
      }).eq("id", log.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, processed: (logs?.length || 0) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
