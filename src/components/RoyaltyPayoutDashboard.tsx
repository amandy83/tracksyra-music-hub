import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, CreditCard, FileSpreadsheet, Landmark, LineChart, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

const client = supabase as any;

type RoyaltyRole = "artist" | "label" | "publisher" | "super_admin";

type Balance = {
  lifetime_earnings: number;
  available_balance: number;
  pending_earnings: number;
  paid_earnings: number;
  monthly_trends?: Array<{ month: string; revenue: number }>;
  top_releases?: Array<{ release_id: string; revenue: number }>;
};

export default function RoyaltyPayoutDashboard({ role = "artist" }: { role?: RoyaltyRole }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [labelMetrics, setLabelMetrics] = useState<any | null>(null);
  const [publisherMetrics, setPublisherMetrics] = useState<any | null>(null);
  const [adminMetrics, setAdminMetrics] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [artistDash, labelDash, publisherDash, adminDash, analyticsDash, payoutRows, statementRows] = await Promise.all([
      client.from("artist_royalty_dashboard").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("label_royalty_dashboard").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("publisher_royalty_dashboard").select("*").eq("user_id", user.id).maybeSingle(),
      role === "super_admin" ? client.from("super_admin_royalty_dashboard").select("*").maybeSingle() : Promise.resolve({ data: null }),
      client.from("royalty_analytics_dashboard").select("*").maybeSingle(),
      client.from("payout_history_summary").select("*").order("created_at", { ascending: false }).limit(8),
      client.from("royalty_statements").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    if (artistDash.error && role === "artist") toast.error(artistDash.error.message);
    setBalance((artistDash.data || null) as Balance | null);
    setLabelMetrics(labelDash.data || null);
    setPublisherMetrics(publisherDash.data || null);
    setAdminMetrics(adminDash.data || null);
    setAnalytics(analyticsDash.data || null);
    setPayouts(payoutRows.data || []);
    setStatements(statementRows.data || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user, role]);

  const trends = useMemo(() => normalizeJsonArray(balance?.monthly_trends || analytics?.revenue_trends), [balance, analytics]);
  const revenueByDsp = useMemo(() => normalizeJsonArray(analytics?.revenue_by_dsp), [analytics]);
  const roleSummary = getRoleSummary(role, { balance, labelMetrics, publisherMetrics, adminMetrics });

  if (loading) {
    return <GlassCard className="p-5"><SectionHeader title="Royalties" description="Loading royalty accounting and payout data." /></GlassCard>;
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {roleSummary.map((item) => (
          <KpiCard key={item.label} label={item.label} value={item.value} delta={item.delta} comparison={item.comparison} icon={item.icon} accent={item.accent as any} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <GlassCard className="p-5">
          <SectionHeader title="Revenue Analytics" description="Revenue by DSP, release, artist, and monthly trend." />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ChartFrame>
              <AreaChart data={trends.length ? trends : [{ month: "No data", revenue: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#14b8a6" fill="#ccfbf1" strokeWidth={3} />
              </AreaChart>
            </ChartFrame>
            <ChartFrame>
              <BarChart data={revenueByDsp.length ? revenueByDsp : [{ dsp: "No data", revenue: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dsp" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#ec4899" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Statements" description="Monthly, quarterly, and annual statements." action={<Button size="sm" variant="outline" className="rounded-xl bg-white/70"><FileSpreadsheet className="mr-2 h-4 w-4" />Export</Button>} />
          <div className="space-y-3">
            {statements.length ? statements.map((statement) => (
              <div key={statement.id} className="rounded-2xl border border-white/80 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold capitalize">{statement.statement_type} statement</p>
                    <p className="text-xs text-slate-500">{money(statement.payable_amount, statement.currency)} payable</p>
                  </div>
                  <Badge variant={statement.status === "published" ? "default" : "outline"}>{statement.status}</Badge>
                </div>
                <div className="mt-2 flex gap-2 text-xs text-slate-500">
                  <span>PDF {statement.pdf_url ? "ready" : "pending"}</span>
                  <span>CSV {statement.csv_url ? "ready" : "pending"}</span>
                  <span>XLSX {statement.xlsx_url ? "ready" : "pending"}</span>
                </div>
              </div>
            )) : <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No statements generated yet.</p>}
          </div>
        </GlassCard>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <GlassCard className="p-5">
          <SectionHeader title="Payout Workflow" description="Request, review, approve, pay, and receipt tracking." action={<Button size="sm" variant="hero" className="rounded-xl"><Wallet className="mr-2 h-4 w-4" />Request</Button>} />
          <div className="space-y-3">
            {payouts.length ? payouts.map((payout) => (
              <div key={payout.payout_request_id} className="rounded-2xl border border-white/80 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{money(payout.amount, payout.currency)}</p>
                    <p className="text-xs text-slate-500">{payout.provider || "provider pending"} - {payout.review_status || payout.state}</p>
                  </div>
                  <Badge variant={payout.review_status === "paid" ? "default" : payout.review_status === "rejected" ? "destructive" : "outline"}>{payout.review_status || payout.state}</Badge>
                </div>
              </div>
            )) : <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No payout requests yet.</p>}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Payment Rails" description="Razorpay, Stripe, and bank transfer adapter readiness." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Rail label="Razorpay" icon={CreditCard} />
            <Rail label="Stripe" icon={ShieldCheck} />
            <Rail label="Bank Transfer" icon={Landmark} />
          </div>
        </GlassCard>
      </section>
    </div>
  );
}

function ChartFrame({ children }: { children: React.ReactElement }) {
  return <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

function Rail({ label, icon: Icon }: { label: string; icon: typeof CreditCard }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
      <Icon className="h-5 w-5 text-pink-600" />
      <p className="mt-3 text-sm font-bold">{label}</p>
      <p className="mt-1 text-xs text-slate-500">Adapter ready</p>
    </div>
  );
}

function getRoleSummary(role: RoyaltyRole, data: any) {
  if (role === "super_admin") {
    return [
      { label: "Global Revenue", value: money(data.adminMetrics?.global_revenue), delta: 8, comparison: "all royalties", icon: Banknote, accent: "green" },
      { label: "Payout Queue", value: data.adminMetrics?.payout_queue || 0, delta: -2, comparison: "awaiting action", icon: Wallet, accent: "amber" },
      { label: "Adjustments", value: data.adminMetrics?.royalty_adjustments || 0, delta: 0, comparison: "manual changes", icon: ReceiptText, accent: "blue" },
      { label: "Audit Logs", value: data.adminMetrics?.audit_logs || 0, delta: 4, comparison: "tracked events", icon: ShieldCheck, accent: "slate" },
    ];
  }
  if (role === "publisher") {
    return [
      { label: "Publishing Revenue", value: money(data.publisherMetrics?.publishing_revenue), delta: 9, comparison: "rights income", icon: Banknote, accent: "green" },
      { label: "Writer Shares", value: normalizeJsonArray(data.publisherMetrics?.writer_shares).length, delta: 3, comparison: "active writers", icon: ReceiptText, accent: "blue" },
      { label: "Rights Revenue", value: money(data.publisherMetrics?.rights_revenue), delta: 6, comparison: "catalog rights", icon: LineChart, accent: "teal" },
      { label: "Available", value: money(data.balance?.available_balance), delta: 0, comparison: "withdrawable", icon: Wallet, accent: "amber" },
    ];
  }
  if (role === "label") {
    return [
      { label: "Catalog Revenue", value: money(data.labelMetrics?.catalog_revenue), delta: 10, comparison: "managed catalog", icon: Banknote, accent: "green" },
      { label: "Artist Breakdown", value: normalizeJsonArray(data.labelMetrics?.artist_breakdown).length, delta: 5, comparison: "earning artists", icon: ReceiptText, accent: "blue" },
      { label: "Revenue Growth", value: money(data.labelMetrics?.revenue_growth), delta: 7, comparison: "last 30 days", icon: LineChart, accent: "teal" },
      { label: "Available", value: money(data.balance?.available_balance), delta: 0, comparison: "withdrawable", icon: Wallet, accent: "amber" },
    ];
  }
  return [
    { label: "Lifetime Earnings", value: money(data.balance?.lifetime_earnings), delta: 8, comparison: "all time", icon: Banknote, accent: "green" },
    { label: "Available Balance", value: money(data.balance?.available_balance), delta: 0, comparison: "withdrawable", icon: Wallet, accent: "teal" },
    { label: "Pending Earnings", value: money(data.balance?.pending_earnings), delta: 3, comparison: "statement pending", icon: ReceiptText, accent: "amber" },
    { label: "Paid Earnings", value: money(data.balance?.paid_earnings), delta: 5, comparison: "settled", icon: ShieldCheck, accent: "blue" },
  ];
}

function normalizeJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function money(value: unknown, currency = "USD") {
  const amount = Number(value || 0);
  return `${currency} ${amount.toFixed(2)}`;
}
