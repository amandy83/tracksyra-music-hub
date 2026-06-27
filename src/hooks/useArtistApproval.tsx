import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useIsAdmin } from "./useRole";

export type ArtistApprovalState = {
  approved: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NONE";
  artistId: string | null;
};

const client = supabase as any;

export const useArtistApproval = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [state, setState] = useState<ArtistApprovalState>({
    approved: false,
    status: "NONE",
    artistId: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      setState({ approved: false, status: "NONE", artistId: null });
      setLoading(false);
      return;
    }
    if (isAdmin) {
      setState({ approved: true, status: "APPROVED", artistId: user.id });
      setLoading(false);
      return;
    }

    setLoading(true);
    const email = user.email || "";
    client
      .from("artist_requests")
      .select("status, artist_id")
      .or(`user_id.eq.${user.id},email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          setState({ approved: false, status: "NONE", artistId: null });
          setLoading(false);
          return;
        }
        const status = (data?.status || "NONE") as ArtistApprovalState["status"];
        setState({
          approved: status === "APPROVED",
          status,
          artistId: data?.artist_id || null,
        });
        setLoading(false);
      });
  }, [authLoading, roleLoading, user, isAdmin]);

  return { ...state, loading };
};
