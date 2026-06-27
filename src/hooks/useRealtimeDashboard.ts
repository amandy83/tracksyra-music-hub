import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type DashboardRealtimeEventType =
  | "STREAM_RECEIVED"
  | "ROYALTY_UPDATED"
  | "WALLET_CREDITED"
  | "FRAUD_FLAGGED"
  | "DISTRIBUTION_STATUS_CHANGED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_COMPLETED"
  | "DASHBOARD_SNAPSHOT_UPDATED";

export type DashboardRealtimeEvent = {
  event_id: string;
  event_type: DashboardRealtimeEventType;
  entity_type: string;
  entity_id: string;
  artist_id?: string | null;
  track_id?: string | null;
  platform?: string | null;
  sequence_number: number;
  payload: Record<string, any>;
  occurred_at: string;
};

export type LiveDashboardSnapshot = {
  artist_id: string;
  stream_counts: Record<string, number>;
  revenue_updates: Record<string, string>;
  fraud_alerts: Array<Record<string, any>>;
  distribution_statuses: Record<string, string>;
  payout_updates: Array<Record<string, any>>;
  rolling_metrics: Record<string, any>;
  updated_at?: string;
};

type ConnectionState = "idle" | "connecting" | "connected" | "fallback" | "error";

const EMPTY_SNAPSHOT: LiveDashboardSnapshot = {
  artist_id: "",
  stream_counts: {},
  revenue_updates: {},
  fraud_alerts: [],
  distribution_statuses: {},
  payout_updates: [],
  rolling_metrics: {},
};

export function useRealtimeDashboard(artistId?: string | null) {
  const { session, user } = useAuth();
  const resolvedArtistId = artistId ?? user?.id ?? null;
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [snapshot, setSnapshot] = useState<LiveDashboardSnapshot>(EMPTY_SNAPSHOT);
  const [events, setEvents] = useState<DashboardRealtimeEvent[]>([]);
  const lastSequenceRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = useMemo(() => resolvedArtistId ? `artist:${resolvedArtistId}` : null, [resolvedArtistId]);

  const applyEvent = useCallback((event: DashboardRealtimeEvent) => {
    if (event.sequence_number <= lastSequenceRef.current) return;
    lastSequenceRef.current = event.sequence_number;
    setEvents((current) => [event, ...current].slice(0, 100));

    setSnapshot((current) => reduceDashboardEvent(current.artist_id ? current : {
      ...EMPTY_SNAPSHOT,
      artist_id: resolvedArtistId ?? "",
    }, event));
  }, [resolvedArtistId]);

  const loadSnapshotFallback = useCallback(async () => {
    if (!resolvedArtistId) return;
    const client = supabase as any;
    const { data } = await client
      .from("live_dashboard_snapshots")
      .select("*")
      .eq("artist_id", resolvedArtistId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setSnapshot({
        artist_id: resolvedArtistId,
        stream_counts: data.stream_counts ?? {},
        revenue_updates: data.revenue_updates ?? {},
        fraud_alerts: data.fraud_alerts ?? [],
        distribution_statuses: data.distribution_statuses ?? {},
        payout_updates: data.payout_updates ?? [],
        rolling_metrics: data.rolling_metrics ?? {},
        updated_at: data.calculated_at,
      });
    }
  }, [resolvedArtistId]);

  useEffect(() => {
    if (!channel || !session?.access_token) return;
    loadSnapshotFallback();

    const wsUrl = import.meta.env.VITE_REALTIME_WS_URL as string | undefined;
    if (!wsUrl) {
      setConnectionState("fallback");
      const realtimeChannel = supabase
        .channel(`dashboard-${channel}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "realtime_event_log",
          filter: `artist_id=eq.${resolvedArtistId}`,
        }, (payload) => applyEvent(payload.new as DashboardRealtimeEvent))
        .subscribe();
      return () => {
        supabase.removeChannel(realtimeChannel);
      };
    }

    let closed = false;
    const connect = () => {
      if (closed) return;
      setConnectionState("connecting");
      const url = new URL(wsUrl);
      url.searchParams.set("token", session.access_token);
      const socket = new WebSocket(url.toString());
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionState("connected");
        socket.send(JSON.stringify({
          type: "subscribe",
          channel,
          since_sequence: lastSequenceRef.current,
        }));
      };

      socket.onmessage = (message) => {
        const parsed = JSON.parse(message.data);
        if (parsed.type === "event") applyEvent(parsed.event);
        if (parsed.type === "snapshot") setSnapshot(parsed.snapshot);
      };

      socket.onerror = () => setConnectionState("error");
      socket.onclose = () => {
        if (closed) return;
        setConnectionState("connecting");
        reconnectTimerRef.current = setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [applyEvent, channel, loadSnapshotFallback, resolvedArtistId, session?.access_token]);

  return {
    connectionState,
    snapshot,
    events,
    lastSequence: lastSequenceRef.current,
    reconnect: () => {
      socketRef.current?.close();
      void loadSnapshotFallback();
    },
  };
}

function reduceDashboardEvent(snapshot: LiveDashboardSnapshot, event: DashboardRealtimeEvent): LiveDashboardSnapshot {
  const next = { ...snapshot };
  if (event.event_type === "DASHBOARD_SNAPSHOT_UPDATED" && event.payload?.snapshot) {
    return event.payload.snapshot as LiveDashboardSnapshot;
  }
  if (event.event_type === "STREAM_RECEIVED" && event.track_id) {
    const increment = Number(event.payload.stream_count_increment ?? 0);
    next.stream_counts = {
      ...next.stream_counts,
      [event.track_id]: (next.stream_counts[event.track_id] ?? 0) + increment,
    };
  }
  if (event.event_type === "ROYALTY_UPDATED" && event.track_id) {
    next.revenue_updates = {
      ...next.revenue_updates,
      [event.track_id]: String(event.payload.total_revenue ?? next.revenue_updates[event.track_id] ?? "0"),
    };
  }
  if (event.event_type === "FRAUD_FLAGGED") {
    next.fraud_alerts = [event.payload, ...next.fraud_alerts].slice(0, 50);
  }
  if (event.event_type === "DISTRIBUTION_STATUS_CHANGED") {
    const key = `${event.payload.release_id}:${event.payload.track_id ?? "release"}:${event.payload.platform}`;
    next.distribution_statuses = {
      ...next.distribution_statuses,
      [key]: String(event.payload.status),
    };
  }
  if (event.event_type === "PAYOUT_REQUESTED" || event.event_type === "PAYOUT_COMPLETED") {
    next.payout_updates = [event.payload, ...next.payout_updates].slice(0, 50);
  }
  return { ...next, updated_at: event.occurred_at };
}
