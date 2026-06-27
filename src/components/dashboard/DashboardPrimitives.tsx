import { memo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, LucideIcon, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const GlassCard = memo(function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      whileHover={{ y: -2 }}
    >
      <Card
        className={cn(
          "rounded-2xl border-white/80 bg-white/78 shadow-xl shadow-slate-950/[0.07] backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-slate-950/[0.10] focus-within:shadow-2xl focus-within:shadow-slate-950/[0.10]",
          className
        )}
      >
        {children}
      </Card>
    </motion.div>
  );
});

export const KpiCard = memo(function KpiCard(props: {
  label: string;
  value: string | number;
  delta?: number;
  comparison?: string;
  icon: LucideIcon;
  accent?: "pink" | "teal" | "amber" | "blue" | "green" | "slate";
}) {
  const Icon = props.icon;
  const positive = Number(props.delta || 0) >= 0;
  const accents = {
    pink: "from-pink-500 to-rose-500",
    teal: "from-teal-500 to-cyan-500",
    amber: "from-amber-500 to-orange-500",
    blue: "from-blue-500 to-indigo-500",
    green: "from-emerald-500 to-lime-500",
    slate: "from-slate-800 to-slate-600",
  };
  return (
    <GlassCard className="overflow-hidden p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{props.label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{props.value}</p>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg", accents[props.accent || "pink"])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold", positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(Number(props.delta || 0))}%
        </span>
        <span className="truncate text-xs font-medium text-slate-500">{props.comparison || "vs last month"} </span>
      </div>
    </GlassCard>
  );
});

export const SectionHeader = memo(function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
});

export const SkeletonCard = memo(function SkeletonCard({ className }: { className?: string }) {
  return (
    <GlassCard className={cn("p-4", className)}>
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-28 rounded-full bg-slate-200" />
        <div className="h-9 w-36 rounded-full bg-slate-200" />
        <div className="h-3 w-full rounded-full bg-slate-100" />
        <div className="h-3 w-2/3 rounded-full bg-slate-100" />
      </div>
    </GlassCard>
  );
});

export const ChartLoading = memo(function ChartLoading() {
  return (
    <div className="flex h-[320px] items-end gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/45 p-5" aria-label="Loading chart">
      {[38, 62, 48, 78, 54, 88, 68, 44, 72].map((height, index) => (
        <div key={index} className="flex-1 animate-pulse rounded-t-xl bg-gradient-to-t from-pink-200 to-teal-100" style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }} />
      ))}
    </div>
  );
});

export const EmptyState = memo(function EmptyState(props: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  icon: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <GlassCard className="p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">{props.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{props.description}</p>
      <Button className="mt-5 rounded-xl" variant="hero" onClick={props.onAction}>
        <PlusCircle className="mr-2 h-4 w-4" />
        {props.actionLabel}
      </Button>
    </GlassCard>
  );
});
