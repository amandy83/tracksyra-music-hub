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
    if (principal.roles?.some((role) => role === "super_admin" || role === "admin")) return true;
    const [kind, id] = channel.split(":");
    if (!id) return false;

    if (kind === "artist") return this.canAccessArtist(principal, id);
    if (kind === "track") {
      const rows = await this.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM tracks
          WHERE id = :id
            AND (
              user_id = :userId
              OR EXISTS (
                SELECT 1
                  FROM label_artists la
                 WHERE la.artist_user_id = tracks.user_id
                   AND la.label_user_id = :userId
                   AND la.status = 'active'
              )
              OR EXISTS (
                SELECT 1
                  FROM publisher_labels pl
                  JOIN label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
                 WHERE pl.publisher_user_id = :userId
                   AND la.artist_user_id = tracks.user_id
                   AND pl.status = 'active'
              )
            )`,
        { id, userId: principal.user_id },
      );
      return (rows[0]?.count ?? 0) > 0;
    }
    if (kind === "release") {
      const rows = await this.db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM releases
          WHERE id = :id
            AND (
              user_id = :userId
              OR EXISTS (
                SELECT 1
                  FROM label_artists la
                 WHERE la.artist_user_id = releases.user_id
                   AND la.label_user_id = :userId
                   AND la.status = 'active'
              )
              OR EXISTS (
                SELECT 1
                  FROM publisher_labels pl
                  JOIN label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
                 WHERE pl.publisher_user_id = :userId
                   AND la.artist_user_id = releases.user_id
                   AND pl.status = 'active'
              )
            )`,
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

  private async canAccessArtist(principal: RealtimePrincipal, artistId: string): Promise<boolean> {
    if (principal.user_id === artistId) return true;
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         WHERE EXISTS (
           SELECT 1
             FROM label_artists la
            WHERE la.artist_user_id = :artistId
              AND la.label_user_id = :userId
              AND la.status = 'active'
         )
         OR EXISTS (
           SELECT 1
             FROM publisher_labels pl
             JOIN label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
            WHERE pl.publisher_user_id = :userId
              AND la.artist_user_id = :artistId
              AND pl.status = 'active'
         )`,
      { artistId, userId: principal.user_id },
    );
    return (rows[0]?.count ?? 0) > 0;
  }
}
