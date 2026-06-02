export type AdminAuditAction =
  | "APPROVE_ARTIST_REQUEST"
  | "REJECT_ARTIST_REQUEST"
  | "ARTIST_ID_ASSIGNED"
  | "EMAIL_SENT_APPROVAL";

export type AdminAuditLogInput = {
  action: AdminAuditAction;
  actorAdminId: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

export type SqlExecutor = {
  query<T = unknown>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
};

export class AdminAuditLogger {
  constructor(private db: SqlExecutor) {}

  async log(input: AdminAuditLogInput) {
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO admin_audit_logs (action, actor_admin_id, target_id, metadata)
       VALUES (:action, :actorAdminId, :targetId, CAST(:metadata AS jsonb))
       RETURNING id`,
      {
        action: input.action,
        actorAdminId: input.actorAdminId,
        targetId: input.targetId,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    );
    return rows[0]?.id ?? null;
  }
}
