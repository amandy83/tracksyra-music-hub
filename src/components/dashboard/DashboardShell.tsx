import { memo, type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  Disc3,
  DollarSign,
  Film,
  Gauge,
  HeartHandshake,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Menu,
  Music2,
  RadioTower,
  Search,
  Settings,
  ShieldCheck,
  Rocket,
  Sparkles,
  Users,
  X,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS, useRoles } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
};

const artistNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Music Distribution", href: "/dashboard", icon: RadioTower },
  { label: "DSP Marketing Hub", href: "/dashboard/dsp-marketing", icon: Sparkles },
  { label: "Pre-Save Builder", href: "/dashboard/pre-save", icon: Rocket },
  { label: "Releases", href: "/releases", icon: Disc3 },
  { label: "Playlist Pitching", href: "/dashboard/playlist-pitching", icon: ListMusic },
  { label: "Curator Marketplace", href: "/dashboard/curator-marketplace", icon: HeartHandshake },
  { label: "Playlist Analytics", href: "/dashboard/playlist-performance", icon: BarChart3 },
  { label: "Promo Assets Studio", href: "/dashboard/promo-assets", icon: Film },
  { label: "Revenue", href: "/dashboard", icon: DollarSign },
  { label: "Analytics", href: "/dashboard", icon: Activity },
  { label: "Notifications", href: "/dashboard", icon: Bell },
  { label: "Settings", href: "/dashboard", icon: Settings },
];

const adminNav = [
  { label: "Admin Overview", href: "/admin", icon: ShieldCheck },
  { label: "Too Lost Provider", href: "/admin?tab=too-lost", icon: Globe2 },
  { label: "Review Queue", href: "/admin/review-queue", icon: ClipboardCheck },
  { label: "Curator Management", href: "/admin", icon: Users },
  { label: "Promo Assets", href: "/admin", icon: Film },
  { label: "Distribution Queue", href: "/admin", icon: RadioTower },
  { label: "Platform Analytics", href: "/admin", icon: Gauge },
  { label: "Users", href: "/admin?tab=users", icon: Users },
  { label: "System Health", href: "/admin", icon: Activity },
];

const publisherNav = [
  { label: "Publisher Dashboard", href: "/dashboard/publisher", icon: Building2 },
  { label: "Label Management", href: "/dashboard/label-management", icon: Users },
  { label: "Artist Assignments", href: "/dashboard/artist-assignments", icon: ClipboardCheck },
  { label: "Release Approvals", href: "/admin/review-queue", icon: ShieldCheck },
];

const labelNav = [
  { label: "Label Management", href: "/dashboard/label-management", icon: Users },
  { label: "Artist Assignments", href: "/dashboard/artist-assignments", icon: ClipboardCheck },
];

export const DashboardShell = memo(function DashboardShell({ children, title, eyebrow, actions }: DashboardShellProps) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const roles = useRoles();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
<div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.22),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.10),transparent_32%),linear-gradient(135deg,#ffffff_0%,#ffffff_42%,#fff7fb_100%)]" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 border-white/70 bg-white/85 shadow-lg backdrop-blur-xl lg:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[292px] flex-col border-r border-white/70 bg-white/78 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl transition-transform duration-300 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="mb-5 flex items-center justify-between">
          <button type="button" className="flex items-center gap-3 text-left" onClick={() => navigate("/dashboard")}>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              <Music2 className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight">TrackSyra</span>
              <span className="block text-xs font-medium text-slate-500">Artist command center</span>
            </span>
          </button>
          <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-pink-600" />
            Signed in
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{user?.email || "Artist"}</div>
          {roles.primaryRole && <Badge className="mt-2 bg-slate-950 hover:bg-slate-950">{ROLE_LABELS[roles.primaryRole]}</Badge>}
        </div>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search dashboard"
className="h-10 w-full rounded-xl border border-white/80 bg-white/80 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-pink-500/30 focus:shadow-[0_0_0_4px_rgba(236,72,153,0.12]]"
            placeholder="Search workspace"
          />
        </div>

        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          <NavSection title="Artist" items={artistNav} onNavigate={() => setOpen(false)} />
          {roles.hasAnyRole(["super_admin", "publisher"]) && <NavSection title="Publisher" items={publisherNav} onNavigate={() => setOpen(false)} />}
          {roles.hasAnyRole(["label"]) && !roles.hasAnyRole(["publisher"]) && <NavSection title="Label" items={labelNav} onNavigate={() => setOpen(false)} />}
          {roles.isSuperAdmin && <NavSection title="Operations" items={adminNav} onNavigate={() => setOpen(false)} />}
        </nav>

        <Button type="button" variant="outline" className="mt-4 w-full justify-start rounded-xl bg-white/75" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </aside>

      <div className="lg:pl-[292px]">
<header className="sticky top-0 z-30 border-b border-white/70 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_-18px_rgba(2,6,23,0.18)]">
          <div className="flex min-h-[88px] flex-col justify-center gap-3 px-4 py-4 sm:px-6 xl:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="pl-12 lg:pl-0">
                {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-600">{eyebrow}</p>}
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
});

function NavSection({ title, items, onNavigate }: { title: string; items: typeof artistNav; onNavigate: () => void }) {
  return (
    <div>
      <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={`${title}-${item.label}`}
            to={item.href}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 outline-none transition hover:bg-white hover:text-slate-950 hover:shadow-sm focus-visible:ring-4 focus-visible:ring-pink-500/20",
              isActive && "bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-950 hover:text-white"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
