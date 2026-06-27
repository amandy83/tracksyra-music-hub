export const PASSWORD_RESET_REDIRECT_URL = "https://hello.tracksyra.com/reset-password";

export const FORGOT_PASSWORD_COOLDOWN_MS = 60_000;

export function sanitizeAuthError(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() || "";
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many reset attempts. Please wait a minute before trying again.";
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "Enter a valid email address.";
  }
  if (message.includes("expired") || message.includes("invalid") || message.includes("token") || message.includes("link")) {
    return "This reset link is invalid or has expired. Please request a new password reset email.";
  }
  if (message.includes("password")) {
    return "This password cannot be used. Choose a stronger password and try again.";
  }
  return "We could not complete that request. Please try again.";
}

export function readAuthUrlError(url = window.location.href) {
  const current = new URL(url);
  const hash = new URLSearchParams(current.hash.replace(/^#/, ""));
  const search = current.searchParams;
  return (
    hash.get("error_description") ||
    hash.get("error") ||
    search.get("error_description") ||
    search.get("error")
  );
}

export function urlContainsRecoveryParams(url = window.location.href) {
  const current = new URL(url);
  const hash = new URLSearchParams(current.hash.replace(/^#/, ""));
  return Boolean(
    current.searchParams.get("code") ||
    current.searchParams.get("token") ||
    hash.get("access_token") ||
    hash.get("refresh_token") ||
    hash.get("token") ||
    hash.get("type") === "recovery" ||
    current.searchParams.get("type") === "recovery"
  );
}
