import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "super_admin" | "publisher" | "label" | "artist";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  publisher: "Publisher",
  label: "Label",
  artist: "Artist",
};

export type AppPermission =
  | "super_admin.full_access"
  | "distribution.manage"
  | "release.approve"
  | "playlist.operations"
  | "analytics.view"
  | "revenue.report"
  | "label.manage_artists"
  | "catalog.manage"
  | "promo_assets.create"
  | "playlist.pitch.submit";

const PERMISSION_ROLES: Record<AppPermission, AppRole[]> = {
  "super_admin.full_access": ["super_admin"],
  "distribution.manage": ["super_admin", "publisher"],
  "release.approve": ["super_admin", "publisher"],
  "playlist.operations": ["super_admin", "publisher"],
  "analytics.view": ["super_admin", "publisher", "label", "artist"],
  "revenue.report": ["super_admin", "publisher", "label", "artist"],
  "label.manage_artists": ["super_admin", "publisher", "label"],
  "catalog.manage": ["super_admin", "publisher", "label", "artist"],
  "promo_assets.create": ["super_admin", "publisher", "label", "artist"],
  "playlist.pitch.submit": ["super_admin", "publisher", "label", "artist"],
};

export const normalizeRole = (role: string): AppRole | null => {
  if (role === "admin") return "super_admin";
  if (["super_admin", "publisher", "label", "artist"].includes(role)) return role as AppRole;
  return null;
};

export const useRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const nextRoles = Array.from(new Set((data || [])
          .map((row) => normalizeRole(String(row.role)))
          .filter(Boolean) as AppRole[]));
        setRoles(nextRoles);
        setLoading(false);
      });
  }, [user, authLoading]);

  const hasRole = (role: AppRole) => roles.includes("super_admin") || roles.includes(role);
  const hasAnyRole = (allowed: AppRole[]) => roles.includes("super_admin") || allowed.some((role) => roles.includes(role));
  const hasPermission = (permission: AppPermission) => hasAnyRole(PERMISSION_ROLES[permission]);

  return {
    roles,
    primaryRole: roles[0] || null,
    loading,
    hasRole,
    hasAnyRole,
    hasPermission,
    isSuperAdmin: roles.includes("super_admin"),
    isPublisher: hasRole("publisher"),
    isLabel: hasRole("label"),
    isArtist: hasRole("artist"),
  };
};

export const useIsAdmin = () => {
  const roleState = useRoles();
  return {
    isAdmin: roleState.hasAnyRole(["super_admin", "publisher"]),
    loading: roleState.loading,
    ...roleState,
  };
};
