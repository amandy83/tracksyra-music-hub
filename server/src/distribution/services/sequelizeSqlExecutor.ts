import { QueryTypes, Sequelize } from "sequelize";

import { loadRuntimeEnv } from "../../config/envLoader";
import type { SqlExecutor } from "./distributionStore";

export class SequelizeSqlExecutor implements SqlExecutor {
  constructor(private sequelize: Sequelize = createSequelize()) {}

  async query<T = unknown>(sql: string, params: Record<string, unknown> = {}): Promise<T[]> {
    return this.sequelize.query<T>(sql, {
      replacements: params,
      type: QueryTypes.SELECT,
    });
  }
}

export function createSequelize(): Sequelize {
  loadRuntimeEnv();
  const databaseUrl = (globalThis as any).process?.env?.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for SQL-backed distribution infrastructure.");
  return new Sequelize(databaseUrl, {
    logging: false,
    dialectOptions: {
      ssl: databaseUrl.includes("sslmode=require") ? { require: true, rejectUnauthorized: false } : undefined,
    },
  });
}
