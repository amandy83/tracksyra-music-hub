import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readAuthUrlError, sanitizeAuthError, urlContainsRecoveryParams } from "@/lib/authReset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import Header from "@/components/Header";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    let mounted = true;
    const urlError = readAuthUrlError();
    const hasRecoveryParams = urlContainsRecoveryParams();
    if (urlError) {
      setResetError(sanitizeAuthError({ message: urlError }));
      setChecking(false);
      return;
    }

    // Supabase fires PASSWORD_RECOVERY when user lands from the email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setResetError("");
        setChecking(false);
      }
    });

    // Also handle case where session is already established
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setResetError(sanitizeAuthError(error));
      } else if (data.session) {
        setReady(true);
      } else if (hasRecoveryParams) {
        setResetError("This reset link is invalid or has expired. Please request a new password reset email.");
      }
      setChecking(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const message = sanitizeAuthError(error);
      setResetError(message);
      return toast.error(message);
    }
    toast.success("Password updated. Please log in.");
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-32 pb-16 flex justify-center">
        <Card className="w-full max-w-md p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-center mb-2">Reset Password</h1>
          <p className="text-center text-muted-foreground mb-6">
            {ready ? "Choose a new password for your account." : "Open the password reset link from your email to continue."}
          </p>

          {checking && (
            <p className="text-center text-sm text-muted-foreground">Checking reset link...</p>
          )}

          {resetError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Reset link unavailable</AlertTitle>
              <AlertDescription>{resetError}</AlertDescription>
            </Alert>
          )}

          {ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input id="password" name="password" type="password" minLength={8} required />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" name="confirm" type="password" minLength={8} required />
              </div>
              <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                {busy ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}

          {!checking && !ready && (
            <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => navigate("/auth")}>
              Request a new reset link
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
};

export default ResetPassword;
