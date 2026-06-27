import { getSupabaseClient, type EmailQueueRow } from "../server/src/notifications/emailQueue";
import { sendQueuedEmail, setEmailDeliveryLogger } from "../server/src/notifications/emailService";

const toFilter = process.argv[2];
const supabase = getSupabaseClient();

setEmailDeliveryLogger(async (entry) => {
  const { error } = await supabase.from("email_delivery_logs").insert({
    to_email: entry.to_email,
    subject: entry.subject,
    status: entry.status,
    provider_response: entry.provider_response || {},
    error_message: entry.error_message || null,
  });
  if (error) throw new Error(`Failed to write delivery log: ${error.message}`);
});

let query = supabase
  .from("email_queue")
  .select("*")
  .in("status", ["PENDING", "RETRYING", "PROCESSING"])
  .order("created_at", { ascending: true })
  .limit(10);

if (toFilter) query = query.eq("to_email", toFilter);

const { data, error } = await query;
if (error) throw new Error(error.message);

const results = [];
for (const row of (data || []) as EmailQueueRow[]) {
  try {
    await supabase
      .from("email_queue")
      .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    const sent = await sendQueuedEmail({
      to: row.to_email,
      subject: row.subject,
      html: row.html_content,
      text: row.text_content || undefined,
    });
    await supabase
      .from("email_queue")
      .update({ status: "SENT", retry_count: row.retry_count, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    results.push({ id: row.id, to: row.to_email, subject: row.subject, ok: true, provider: sent.provider, messageId: sent.messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("email_queue")
      .update({
        status: "FAILED",
        retry_count: row.retry_count + 1,
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    results.push({ id: row.id, to: row.to_email, subject: row.subject, ok: false, error: message });
  }
}

console.log(JSON.stringify({ ok: results.every((result) => result.ok), results }, null, 2));
if (results.some((result) => !result.ok)) process.exit(1);
