import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Send, RefreshCw, Save } from "lucide-react";

type Smtp = {
  id?: string;
  host: string; port: number; secure: boolean;
  username: string; password: string;
  from_name: string; from_email: string;
  is_active: boolean;
};

type Log = {
  id: string; recipient_email: string; subject: string; template: string;
  status: string; error_message: string | null; attempts: number;
  created_at: string; sent_at: string | null;
};

const empty: Smtp = {
  host: "", port: 587, secure: false, username: "", password: "",
  from_name: "TrackSyra", from_email: "", is_active: true,
};

export default function EmailSettings() {
  const [smtp, setSmtp] = useState<Smtp>(empty);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const load = async () => {
    const { data } = await supabase.from("smtp_settings").select("*")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data) setSmtp(data as Smtp);
    const { data: l } = await supabase.from("email_logs").select("*")
      .order("created_at", { ascending: false }).limit(50);
    setLogs((l as Log[]) || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    const payload = { ...smtp };
    const { error } = smtp.id
      ? await supabase.from("smtp_settings").update(payload).eq("id", smtp.id)
      : await supabase.from("smtp_settings").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("SMTP settings saved");
    load();
  };

  const sendTest = async () => {
    if (!testEmail) return toast.error("Enter a test recipient email");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-emails", {
      body: { test: true, to: testEmail },
    });
    setBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message || "Failed");
    toast.success("Test email sent ✓");
  };

  const drainQueue = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-emails", { body: {} });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Processed ${(data as any)?.processed || 0} (sent ${(data as any)?.sent || 0})`);
    load();
  };

  const retry = async (id: string) => {
    await supabase.from("email_logs").update({ status: "pending", attempts: 0, error_message: null }).eq("id", id);
    await supabase.functions.invoke("send-emails", { body: { log_id: id } });
    toast.success("Retry queued");
    load();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-pink-600" />
          <h2 className="text-xl font-bold">SMTP Settings</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>SMTP Host</Label>
            <Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <Label>Port</Label>
            <Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
          </div>
          <div>
            <Label>SMTP Username</Label>
            <Input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
          </div>
          <div>
            <Label>SMTP Password</Label>
            <Input type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} />
          </div>
          <div>
            <Label>From Name</Label>
            <Input value={smtp.from_name} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} />
          </div>
          <div>
            <Label>From Email</Label>
            <Input value={smtp.from_email} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} placeholder="noreply@tracksyra.com" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={smtp.secure} onCheckedChange={(v) => setSmtp({ ...smtp, secure: v })} />
            <Label className="!m-0">Use SSL/TLS (port 465)</Label>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={smtp.is_active} onCheckedChange={(v) => setSmtp({ ...smtp, is_active: v })} />
            <Label className="!m-0">Active</Label>
          </div>
        </div>
        <div className="flex gap-2 mt-6 flex-wrap">
          <Button onClick={save} disabled={busy} className="bg-pink-600 hover:bg-pink-700">
            <Save className="w-4 h-4 mr-1" /> Save Settings
          </Button>
          <div className="flex gap-2 items-center ml-auto">
            <Input className="w-56" placeholder="test@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <Button variant="outline" onClick={sendTest} disabled={busy}>
              <Send className="w-4 h-4 mr-1" /> Send Test Email
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Email Logs (last 50)</h2>
          <Button variant="outline" size="sm" onClick={drainQueue} disabled={busy}>
            <RefreshCw className="w-4 h-4 mr-1" /> Process Queue
          </Button>
        </div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No emails yet.</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 text-sm p-3 border rounded-lg">
              <Badge variant="outline" className={
                l.status === "sent" ? "bg-green-100 text-green-800 border-green-200"
                : l.status === "failed" ? "bg-red-100 text-red-800 border-red-200"
                : "bg-amber-100 text-amber-800 border-amber-200"
              }>{l.status}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{l.subject}</div>
                <div className="text-xs text-muted-foreground truncate">
                  → {l.recipient_email} · {l.template} · {new Date(l.created_at).toLocaleString()}
                  {l.attempts > 0 && ` · ${l.attempts} attempt${l.attempts > 1 ? "s" : ""}`}
                </div>
                {l.error_message && <div className="text-xs text-red-600 mt-1 truncate">{l.error_message}</div>}
              </div>
              {l.status === "failed" && (
                <Button size="sm" variant="ghost" onClick={() => retry(l.id)}>Retry</Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
