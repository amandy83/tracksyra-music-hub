import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../config/envLoader";
import { enqueueEmail } from "../notifications/emailQueue";
import { renderEmailTemplate } from "../notifications/emailService";
import { logger } from "../observability/logger";

const DEFAULT_REDIRECT_URL = "https://hello.tracksyra.com/reset-password";

export type ForgotPasswordResult = {
  accepted: true;
  sent: boolean;
  emailQueueId?: string;
};

export class PasswordResetService {
  constructor(private supabase: SupabaseClient = createSupabaseAdminClient()) {}

  async forgotPassword(email: string, redirectTo = readEnv("PASSWORD_RESET_REDIRECT_URL") || DEFAULT_REDIRECT_URL): Promise<ForgotPasswordResult> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw httpError(400, "INVALID_EMAIL");

    const user = await this.findUserByEmail(normalizedEmail);
    if (!user) {
      logger.info("password reset requested for unknown email", { component: "password-reset", email: maskEmail(normalizedEmail) });
      return { accepted: true, sent: false };
    }

    const { data, error } = await this.supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo },
    });
    if (error) throw new Error(`Supabase recovery link generation failed: ${error.message}`);

    const recoveryLink = data.properties?.action_link;
    if (!recoveryLink) throw new Error("Supabase recovery link generation did not return an action link.");

    const subject = "Reset your TrackSyra password";
    const html = renderEmailTemplate("password_reset", {
      name: displayName(user),
      reset_url: recoveryLink,
      dashboard_url: redirectTo,
    });

    const queued = await enqueueEmail({
      to: normalizedEmail,
      subject,
      html,
      text: `Reset your TrackSyra password: ${recoveryLink}`,
      template_type: "PASSWORD_RESET",
      payload: {
        user_id: user.id,
        purpose: "password_reset",
        redirect_to: redirectTo,
        generated_at: new Date().toISOString(),
      },
      max_retries: 3,
    });

    await this.supabase.from("email_logs").insert({
      recipient_email: normalizedEmail,
      recipient_name: displayName(user),
      subject,
      template: "password_reset",
      template_data: {
        user_id: user.id,
        email_queue_id: queued.id,
        redirect_to: redirectTo,
      },
      status: "queued",
      related_table: "auth.users",
      related_id: user.id,
    });

    return { accepted: true, sent: true, emailQueueId: queued.id };
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    let page = 1;
    const perPage = 1000;
    while (page <= 50) {
      const { data, error } = await this.supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`Failed to validate auth user: ${error.message}`);
      const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
      if (user) return user;
      if (data.users.length < perPage) return null;
      page += 1;
    }
    throw new Error("Auth user lookup exceeded the supported page limit.");
  }
}

function createSupabaseAdminClient() {
  loadRuntimeEnv();
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("PasswordResetService requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255 ? email : null;
}

function displayName(user: User) {
  return String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Artist");
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

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
