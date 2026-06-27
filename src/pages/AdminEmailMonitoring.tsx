import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

type EmailMonitoringRow = {
  id: string;
  recipient: string;
  email_type: string;
  subject: string;
  delivery_status: string;
  message_id: string | null;
  opens: number;
  clicks: number;
  bounces: number;
  last_activity: string;
  created_at: string;
};

const client = supabase as any;

export default function AdminEmailMonitoring() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EmailMonitoringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await client
      .from("email_monitoring")
      .select("*")
      .order("last_activity", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data || []) as EmailMonitoringRow[]);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-email-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_delivery_logs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "email_events" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.recipient, row.email_type, row.subject, row.delivery_status, row.message_id || ""]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Monitoring</h1>
            <p className="text-sm text-muted-foreground">Delivery and engagement activity from TrackSyra email systems</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Admin
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label="Sent" value={rows.filter((row) => row.delivery_status === "SENT" || row.delivery_status === "DELIVERED").length} />
          <Metric label="Opened" value={rows.reduce((sum, row) => sum + row.opens, 0)} />
          <Metric label="Clicked" value={rows.reduce((sum, row) => sum + row.clicks, 0)} />
          <Metric label="Bounced" value={rows.reduce((sum, row) => sum + row.bounces, 0)} />
          <Metric label="Tracked" value={rows.filter((row) => row.message_id).length} />
        </div>

        <Card className="p-4">
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipient, type, status, subject..."
              className="pl-9"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Email Type</TableHead>
                <TableHead>Delivery Status</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Bounces</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.recipient}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-64">{row.message_id || "No Message-ID yet"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatType(row.email_type)}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-72">{row.subject}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={row.delivery_status} /></TableCell>
                  <TableCell className="text-right">{row.opens}</TableCell>
                  <TableCell className="text-right">{row.clicks}</TableCell>
                  <TableCell className="text-right">{row.bounces}</TableCell>
                  <TableCell>{new Date(row.last_activity || row.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">No email activity found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "DELIVERED" || status === "SENT" || status === "OPENED" || status === "CLICKED"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "BOUNCED" || status === "COMPLAINED" || status === "FAILED"
        ? "bg-red-100 text-red-800 border-red-200"
        : "bg-amber-100 text-amber-800 border-amber-200";
  return <Badge variant="outline" className={style}>{status}</Badge>;
}

function formatType(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
