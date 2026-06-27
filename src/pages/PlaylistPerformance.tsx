import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, LineChart as LineChartIcon, RadioTower, Save, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChartLoading, EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

type Placement = {
  placement_id: string;
  curator_name: string;
  playlist_name: string | null;
  spotify_playlist_url: string | null;
  release_title: string;
  track_title: string;
  placement_date: string;
  removal_date: string | null;
  placement_status: string;
  streams_before: number;
  streams_after: number;
  streams_gained: number;
  listeners_gained: number;
  saves_gained: number;
  stream_growth_percent: number;
  placement_duration_days: number;
  estimated_reach: number;
  effectiveness_score: number;
  last_snapshot_at: string | null;
  genre: string | null;
  territory: string | null;
};

type TimelinePoint = {
  snapshot_id: string;
  placement_id: string;
  streams: number;
  listeners: number;
  saves: number;
  playlist_followers: number;
  collected_at: string;
  playlist_name: string | null;
  curator_name: string;
};

const client = supabase as any;
const COLORS = ["#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#22c55e", "#ef4444"];

export default function PlaylistPerformance() {
  const { user } = useAuth();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [placementResult, timelineResult] = await Promise.all([
      client.from("playlist_performance_artist_dashboard").select("*").order("placement_date", { ascending: false }),
      client.from("playlist_performance_timeline").select("*").order("collected_at", { ascending: true }),
    ]);
    if (placementResult.error) toast.error(placementResult.error.message);
    if (timelineResult.error) toast.error(timelineResult.error.message);
    setPlacements(placementResult.data || []);
    setTimeline(timelineResult.data || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user]);

  const metrics = useMemo(() => {
    const active = placements.filter((item) => item.placement_status === "active").length;
    const reach = placements.reduce((sum, item) => sum + Number(item.estimated_reach || 0), 0);
    const streams = placements.reduce((sum, item) => sum + Number(item.streams_gained || 0), 0);
    const listeners = placements.reduce((sum, item) => sum + Number(item.listeners_gained || 0), 0);
    const saves = placements.reduce((sum, item) => sum + Number(item.saves_gained || 0), 0);
    const accepted = placements.length;
    const totalOutcomes = placements.filter((item) => ["active", "removed", "expired"].includes(item.placement_status)).length;
    return {
      active,
      reach,
      streams,
      listeners,
      saves,
      acceptanceRate: totalOutcomes ? Math.round((accepted / totalOutcomes) * 100) : accepted ? 100 : 0,
    };
  }, [placements]);

  const streamTimeline = useMemo(() => timeline.map((point) => ({
    date: new Date(point.collected_at).toLocaleDateString(),
    streams: Number(point.streams || 0),
    listeners: Number(point.listeners || 0),
    saves: Number(point.saves || 0),
  })), [timeline]);

  const performanceBars = placements.slice(0, 8).map((item) => ({
    name: item.playlist_name || item.curator_name,
    streams: Number(item.streams_gained || 0),
    listeners: Number(item.listeners_gained || 0),
    saves: Number(item.saves_gained || 0),
  }));

  const contribution = placements.reduce<Record<string, number>>((acc, item) => {
    const key = item.playlist_name || item.curator_name || "Playlist";
    acc[key] = (acc[key] || 0) + Number(item.streams_gained || 0);
    return acc;
  }, {});
  const contributionData = Object.entries(contribution).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const reportRows = placements.map((item) => ({
    playlist: item.playlist_name || "",
    curator: item.curator_name,
    release: item.release_title,
    track: item.track_title,
    status: item.placement_status,
    placement_date: item.placement_date ? new Date(item.placement_date).toLocaleDateString() : "",
    streams_gained: item.streams_gained,
    listeners_gained: item.listeners_gained,
    saves_gained: item.saves_gained,
    growth_percent: item.stream_growth_percent,
    reach: item.estimated_reach,
    duration_days: item.placement_duration_days,
  }));

  return (
    <DashboardShell
      title="Playlist Analytics"
      eyebrow="Performance intelligence"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" size="sm" onClick={() => downloadCsv(reportRows, "playlist-performance.csv")}><Download className="w-4 h-4 mr-1" />CSV</Button>
          <Button variant="outline" className="rounded-xl bg-white/75" size="sm" onClick={() => downloadXlsx(reportRows, "playlist-performance.xlsx")}><FileSpreadsheet className="w-4 h-4 mr-1" />XLSX</Button>
          <Button variant="outline" className="rounded-xl bg-white/75" size="sm" onClick={() => downloadPdf(reportRows, "playlist-performance.pdf")}><FileText className="w-4 h-4 mr-1" />PDF</Button>
        </>
      )}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <KpiCard icon={RadioTower} label="Active Placements" value={metrics.active} delta={8} comparison="live playlists" accent="pink" />
          <KpiCard icon={Users} label="Playlist Reach" value={metrics.reach.toLocaleString()} delta={14} comparison="estimated audience" accent="teal" />
          <KpiCard icon={TrendingUp} label="Streams Gained" value={metrics.streams.toLocaleString()} delta={18} comparison="placement lift" accent="blue" />
          <KpiCard icon={Users} label="Listeners Gained" value={metrics.listeners.toLocaleString()} delta={11} comparison="new audience" accent="green" />
          <KpiCard icon={Save} label="Save Growth" value={metrics.saves.toLocaleString()} delta={7} comparison="listener intent" accent="amber" />
          <KpiCard icon={LineChartIcon} label="Acceptance Rate" value={`${metrics.acceptanceRate}%`} delta={metrics.acceptanceRate ? 5 : 0} comparison="curator fit" accent="slate" />
        </div>

        <Tabs defaultValue="charts">
          <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="placements">Placements ({placements.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="mt-6 space-y-4">
            {loading ? (
              <GlassCard className="p-5"><ChartLoading /></GlassCard>
            ) : placements.length === 0 ? (
              <EmptyState title="No playlist performance yet" description="Accepted curator placements will appear here once performance snapshots are collected." actionLabel="Open marketplace" onAction={() => null} icon={RadioTower} />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartCard title="Stream Growth Timeline">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={streamTimeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="streams" stroke="#ec4899" fill="#fbcfe8" />
                      <Area type="monotone" dataKey="listeners" stroke="#14b8a6" fill="#ccfbf1" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Placement Performance">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={performanceBars}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="streams" fill="#ec4899" />
                      <Bar dataKey="listeners" fill="#14b8a6" />
                      <Bar dataKey="saves" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Playlist Contribution Analysis">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={contributionData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={96} label>
                        {contributionData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
                <GlassCard className="p-4">
                  <SectionHeader title="Top Performing Placements" />
                  <div className="space-y-2">
                    {placements.slice(0, 5).map((item) => (
                      <div key={item.placement_id} className="rounded border p-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.playlist_name || item.curator_name}</p>
                          <p className="text-muted-foreground truncate">{item.release_title} - {item.track_title}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{Number(item.streams_gained || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">streams gained</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}
          </TabsContent>

          <TabsContent value="placements" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {placements.map((item) => (
                <GlassCard key={item.placement_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{item.playlist_name || item.curator_name}</h3>
                        <Badge variant={item.placement_status === "active" ? "default" : "secondary"} className="capitalize">{item.placement_status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.release_title} - {item.track_title}</p>
                      <p className="text-xs text-muted-foreground">{item.genre || "Genre"} - {item.territory || "Global"} - placed {new Date(item.placement_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-bold">{Number(item.effectiveness_score || 0).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">score</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <Mini label="Streams" value={Number(item.streams_gained || 0).toLocaleString()} />
                    <Mini label="Listeners" value={Number(item.listeners_gained || 0).toLocaleString()} />
                    <Mini label="Saves" value={Number(item.saves_gained || 0).toLocaleString()} />
                    <Mini label="Growth" value={`${Number(item.stream_growth_percent || 0)}%`} />
                    <Mini label="Reach" value={Number(item.estimated_reach || 0).toLocaleString()} />
                    <Mini label="Days" value={item.placement_duration_days || 0} />
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border bg-background p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <GlassCard className="p-4"><SectionHeader title={title} />{children}</GlassCard>;
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const headers = Object.keys(rows[0] || { report: "No data" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
  downloadBlob(csv, filename, "text/csv;charset=utf-8");
}

function downloadXlsx(rows: Record<string, unknown>[], filename: string) {
  const headers = Object.keys(rows[0] || { report: "No data" });
  const sheetRows = [
    headers.map((header) => ({ value: header, type: "str" as const })),
    ...rows.map((row) => headers.map((header) => ({
      value: row[header] ?? "",
      type: typeof row[header] === "number" ? "num" as const : "str" as const,
    }))),
  ];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
${sheetRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
  const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (cell.type === "num") return `<c r="${ref}"><v>${Number(cell.value || 0)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(cell.value))}</t></is></c>`;
}).join("")}</row>`).join("")}
</sheetData>
</worksheet>`;
  downloadBytes(buildXlsxArchive(worksheet), filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function downloadPdf(rows: Record<string, unknown>[], filename: string) {
  const lines = ["TrackSyra Playlist Performance Report", `Generated ${new Date().toLocaleString()}`, "", ...rows.flatMap((row, index) => [
    `${index + 1}. ${row.playlist || "Playlist"} - ${row.track || "Track"}`,
    `Curator: ${row.curator || ""}`,
    `Streams gained: ${row.streams_gained || 0}; listeners gained: ${row.listeners_gained || 0}; saves gained: ${row.saves_gained || 0}; reach: ${row.reach || 0}`,
    "",
  ])];
  const pdf = buildSimplePdf(lines);
  downloadBlob(pdf, filename, "application/pdf");
}

function buildSimplePdf(lines: string[]) {
  const objects: string[] = [];
  const body = lines.slice(0, 48).map((line, index) => `BT /F1 10 Tf 50 ${760 - index * 14} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${body.length} >> stream\n${body}\nendstream endobj`);
  let offset = "%PDF-1.4\n".length;
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  const content = objects.map((object) => {
    xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += object.length + 1;
    return object;
  }).join("\n");
  const xrefOffset = "%PDF-1.4\n".length + content.length + 1;
  return `%PDF-1.4\n${content}\n${xref.join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function downloadBytes(content: Uint8Array, filename: string, type: string) {
  const blob = new Blob([content], { type });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function columnName(index: number) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function buildXlsxArchive(worksheet: string) {
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Playlist Performance" sheetId="1" r:id="rId1"/></sheets>
</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`],
    ["xl/worksheets/sheet1.xml", worksheet],
  ]);
}

function zipStore(files: [string, string][]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
