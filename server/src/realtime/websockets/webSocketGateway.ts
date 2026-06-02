import type { EventBus, PublishedRealtimeEvent, RealtimeChannel, RealtimeClientMessage, RealtimeServerMessage } from "../events";
import type { RealtimeAuthorizationService, RealtimePrincipal, RealtimeTokenVerifier } from "./realtimeAuth";
import type { RealtimeEventStore } from "../events";
import { incrementMetric } from "../../queue/metrics";
import { captureException } from "../../observability/errorTracker";

export type RealtimeSocket = {
  id?: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message" | "close" | "pong", handler: (data?: unknown) => void): void;
};

export type WebSocketGatewayDeps = {
  eventBus: EventBus;
  eventStore: RealtimeEventStore;
  authz: RealtimeAuthorizationService;
  verifyToken: RealtimeTokenVerifier;
  heartbeatMs?: number;
};

type SocketState = {
  socket: RealtimeSocket;
  socketId: string;
  principal: RealtimePrincipal;
  channels: Set<RealtimeChannel>;
  lastSeen: number;
};

export class WebSocketGateway {
  private sockets = new Map<string, SocketState>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(private deps: WebSocketGatewayDeps) {
    deps.eventBus.subscribe((event) => this.broadcast(event));
  }

  async handleConnection(socket: RealtimeSocket, input: { token?: string | null; socketId?: string | null }): Promise<void> {
    const principal = input.token ? await this.deps.verifyToken(input.token) : null;
    if (!principal) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const socketId = input.socketId ?? socket.id ?? `socket:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const state: SocketState = { socket, socketId, principal, channels: new Set(), lastSeen: Date.now() };
    this.sockets.set(socketId, state);
    incrementMetric("tracksyra_realtime_websocket_connections_total", { status: "opened" });

    socket.on("message", (data) => void this.handleMessage(state, data).catch((error) => this.handleFailure(state, error)));
    socket.on("pong", () => { state.lastSeen = Date.now(); });
    socket.on("close", () => void this.closeSocket(state));
    this.ensureHeartbeat();
  }

  private async handleMessage(state: SocketState, data: unknown): Promise<void> {
    let message: RealtimeClientMessage;
    try {
      message = JSON.parse(String(data)) as RealtimeClientMessage;
    } catch {
      this.send(state, { type: "error", error: "Invalid realtime message" });
      return;
    }

    state.lastSeen = Date.now();
    if (message.type === "heartbeat") {
      this.send(state, { type: "heartbeat", timestamp: new Date().toISOString() });
      return;
    }
    if (message.type === "subscribe") {
      if (!(await this.deps.authz.canSubscribe(state.principal, message.channel))) {
        this.send(state, { type: "error", error: "Subscription forbidden" });
        return;
      }
      state.channels.add(message.channel);
      await this.deps.eventStore.recordSubscription({
        userId: state.principal.user_id,
        channel: message.channel,
        socketId: state.socketId,
        status: "ACTIVE",
      });
      this.send(state, { type: "subscribed", channel: message.channel });
      const replay = await this.deps.eventBus.replay(message.channel, message.since_sequence ?? 0);
      replay.forEach((event) => this.send(state, { type: "event", event }));
      return;
    }
    if (message.type === "unsubscribe") {
      state.channels.delete(message.channel);
      this.send(state, { type: "unsubscribed", channel: message.channel });
    }
  }

  private broadcast(event: PublishedRealtimeEvent): void {
    for (const state of this.sockets.values()) {
      if (event.channels.some((channel) => state.channels.has(channel as RealtimeChannel))) {
        this.send(state, { type: "event", event });
      }
    }
  }

  private send(state: SocketState, message: RealtimeServerMessage): void {
    try {
      state.socket.send(JSON.stringify(message));
    } catch (error) {
      void this.handleFailure(state, error);
    }
  }

  private async closeSocket(state: SocketState): Promise<void> {
    this.sockets.delete(state.socketId);
    incrementMetric("tracksyra_realtime_websocket_connections_total", { status: "closed" });
    await Promise.all([...state.channels].map((channel) => this.deps.eventStore.recordSubscription({
      userId: state.principal.user_id,
      channel,
      socketId: state.socketId,
      status: "CLOSED",
    })));
  }

  private async handleFailure(state: SocketState, error: unknown) {
    incrementMetric("tracksyra_realtime_gateway_failures_total");
    await captureException({
      error,
      context: { component: "realtime-gateway", socketId: state.socketId, actorUserId: state.principal.user_id },
      tags: { realtime: "websocket" },
    });
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return;
    const heartbeatMs = this.deps.heartbeatMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const state of this.sockets.values()) {
        if (now - state.lastSeen > heartbeatMs * 3) {
          state.socket.close(4408, "Heartbeat timeout");
        } else {
          this.send(state, { type: "heartbeat", timestamp: new Date().toISOString() });
        }
      }
    }, heartbeatMs);
  }
}
