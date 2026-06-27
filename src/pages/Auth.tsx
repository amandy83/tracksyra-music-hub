import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PASSWORD_RESET_REDIRECT_URL, FORGOT_PASSWORD_COOLDOWN_MS, sanitizeAuthError } from "@/lib/authReset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Header from "@/components/Header";

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
});

const cooldownKey = "tracksyra:forgot-password-cooldown-until";

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(() => readCooldownUntil());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
    };
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Check if admin -> redirect to /admin
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id);
      const roleNames = (roles || []).map((r) => String(r.role));
      if (roleNames.includes("super_admin") || roleNames.includes("admin")) {
        navigate("/admin");
        return;
      }
      if (roleNames.includes("publisher")) {
        navigate("/dashboard/publisher");
        return;
      }
      if (roleNames.includes("label")) {
        navigate("/dashboard/label-management");
        return;
      }
    }
    navigate("/dashboard");
  };

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotError("");
    const remainingMs = Math.max(cooldownUntil - Date.now(), 0);
    if (remainingMs > 0) {
      setForgotError(`Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another reset link.`);
      return;
    }

    const parsed = forgotSchema.safeParse({ email: forgotEmail });
    if (!parsed.success) {
      setForgotError(parsed.error.issues[0].message);
      return;
    }

    setForgotBusy(true);
    let error: { message?: string } | null = null;
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          redirectTo: PASSWORD_RESET_REDIRECT_URL,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("application/json")) {
        await response.json().catch(() => ({}));
      } else if (response.status === 404 || !contentType.includes("application/json")) {
        const fallback = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
          redirectTo: PASSWORD_RESET_REDIRECT_URL,
        });
        error = fallback.error;
      } else {
        const body = await response.json().catch(() => ({}));
        error = { message: String(body.error || "Password reset request failed") };
      }
    } catch (requestError) {
      const fallback = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: PASSWORD_RESET_REDIRECT_URL,
      });
      error = fallback.error || (requestError instanceof Error ? null : { message: "Password reset request failed" });
    }
    setForgotBusy(false);

    if (error) {
      const message = sanitizeAuthError(error);
      setForgotError(message);
      if (message.includes("Too many")) startForgotCooldown(setCooldownUntil);
      return;
    }

    setForgotSent(true);
    startForgotCooldown(setCooldownUntil);
    toast.success("If that email is registered, a reset link has been sent.");
  };

  const cooldownSeconds = Math.max(Math.ceil((cooldownUntil - now) / 1000), 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-32 pb-16 flex justify-center">
        <Card className="w-full max-w-md p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-center mb-2">Log In</h1>
          <p className="text-center text-muted-foreground mb-6">
            Access your TrackSyra account
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="l-email">Email</Label>
              <Input id="l-email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="l-password">Password</Label>
              <Input id="l-password" name="password" type="password" required />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>
              {busy ? "Logging in..." : "Log In"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setForgotOpen(true);
              setForgotError("");
              setForgotSent(false);
            }}
            className="block mx-auto mt-4 text-sm text-pink-600 hover:underline"
          >
            Forgot password?
          </button>
          <p className="text-center text-sm text-muted-foreground mt-6">
            New artists must be approved by our team. Please submit the contact form on the homepage.
          </p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            <Link to="/" className="hover:text-primary">← Back to home</Link>
          </p>
        </Card>
      </main>
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your account email and we will send a secure password reset link.
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <Alert>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                If this email is registered, a reset link has been sent. The link can only be used once.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(event) => {
                    setForgotEmail(event.target.value);
                    setForgotError("");
                  }}
                  disabled={forgotBusy}
                  required
                />
              </div>

              {forgotError && (
                <Alert variant="destructive">
                  <AlertTitle>Unable to send reset link</AlertTitle>
                  <AlertDescription>{forgotError}</AlertDescription>
                </Alert>
              )}

              {cooldownSeconds > 0 && (
                <p className="text-sm text-muted-foreground">
                  You can request another reset link in {cooldownSeconds} seconds.
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotBusy}>
                  Cancel
                </Button>
                <Button type="submit" variant="hero" disabled={forgotBusy || cooldownSeconds > 0}>
                  {forgotBusy ? "Sending..." : "Send reset link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function readCooldownUntil() {
  const value = Number(window.localStorage.getItem(cooldownKey) || 0);
  return Number.isFinite(value) ? value : 0;
}

function startForgotCooldown(setCooldownUntil: (value: number) => void) {
  const until = Date.now() + FORGOT_PASSWORD_COOLDOWN_MS;
  window.localStorage.setItem(cooldownKey, String(until));
  setCooldownUntil(until);
}

export default Auth;
