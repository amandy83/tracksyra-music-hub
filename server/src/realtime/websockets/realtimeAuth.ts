import type { SqlExecutor } from "../../royalties/services/royaltyStore";
import type { RealtimeChannel } from "../events";

export type RealtimePrincipal = {
  user_id: string;
  roles?: string[];
};

export type RealtimeTokenVerifier = (token: string) => Promise<RealtimePrincipal | null>;

export class RealtimeAuthorizationService {
  constructor(private db: SqlExecutor) {}

  async canSubscribe(principal: RealtimePrincipal, channel: RealtimeChannel): Promise<boolean> {
    if (principal.roles?.includes("admin")) return true;
    const [kind, id] = channel.split(":");
    if (!id) return false;

    if (kind === "artist") return principal.user_id === id;
    if (kind === "track") {
      const rows = await this.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM tracks WHERE id = :id AND user_id = :userId`,
        { id, userId: principal.user_id },
      );
      return (rows[0]?.count ?? 0) > 0;
    }
    if (kind === "release") {
      const rows = await this.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM releases WHERE id = :id AND user_id = :userId`,
        { id, userId: principal.user_id },
      );
      return (rows[0]?.count ?? 0) > 0;
    }
    if (kind === "payout") {
      const rows = await this.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM payout_requests WHERE id = :id AND user_id = :userId`,
        { id, userId: principal.user_id },
      );
      return (rows[0]?.count ?? 0) > 0;
    }
    return false;
  }
}
