import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import Header from "@/components/Header";

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

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
      if (roles?.some((r) => r.role === "admin")) {
        navigate("/admin");
        return;
      }
    }
    navigate("/dashboard");
  };

  const handleForgot = async () => {
    const email = prompt("Enter your account email to receive a reset link:");
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Reset link sent. Check your email.");
  };

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
            onClick={handleForgot}
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
    </div>
  );
};

export default Auth;
