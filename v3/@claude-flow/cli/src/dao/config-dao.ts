/**
 * ConfigDAO — Data Access Object for the `config` table.
 *
 * Key/value config store with scope support and dangerous-key filtering.
 *
 * @module v3/cli/dao/config-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConfigEntry {
  key: string;
  value: unknown;
  scope: string;
  updatedAt: string;
}

// Keys that must never be set via the MCP tool (security boundary).
const DANGEROUS_KEYS = new Set([
  'apiKey', 'secret', 'token', 'password', 'credential',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
]);

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class ConfigDAO {
  private stmts: {
    get: Database.Statement;
    getScoped: Database.Statement;
    list: Database.Statement;
    listByScope: Database.Statement;
    upsert: Database.Statement;
    delete: Database.Statement;
    deleteAll: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.stmts = {
      get: db.prepare(
        `SELECT * FROM config WHERE key = ?`
      ),
      getScoped: db.prepare(
        `SELECT * FROM config WHERE key = ? AND scope = ?`
      ),
      list: db.prepare(
        `SELECT * FROM config ORDER BY key`
      ),
      listByScope: db.prepare(
        `SELECT * FROM config WHERE scope = ? ORDER BY key`
      ),
      upsert: db.prepare(`
        INSERT INTO config (key, value, scope, updated_at)
        VALUES (@key, @value, @scope, @updatedAt)
        ON CONFLICT(key) DO UPDATE SET
          value = @value, scope = @scope, updated_at = @updatedAt
      `),
      delete: db.prepare(
        `DELETE FROM config WHERE key = ?`
      ),
      deleteAll: db.prepare(
        `DELETE FROM config`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(key: string): unknown {
    const row = this.stmts.get.get(key) as any;
    if (!row) return undefined;
    return ConfigDAO.parseJSON(row.value, row.value);
  }

  getEntry(key: string): ConfigEntry | null {
    const row = this.stmts.get.get(key) as any;
    return row ? ConfigDAO.fromRow(row) : null;
  }

  list(scope?: string): ConfigEntry[] {
    const rows = scope
      ? this.stmts.listByScope.all(scope)
      : this.stmts.list.all();
    return (rows as any[]).map(ConfigDAO.fromRow);
  }

  // ---- Writes --------------------------------------------------------------

  set(key: string, value: unknown, scope = 'global'): boolean {
    if (ConfigDAO.isDangerousKey(key)) {
      throw new Error(`Cannot set dangerous config key: ${key}`);
    }

    this.stmts.upsert.run({
      key,
      value: JSON.stringify(value),
      scope,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  reset(key: string): boolean {
    const info = this.stmts.delete.run(key);
    return info.changes > 0;
  }

  /** Export all config as a plain object. */
  exportAll(): Record<string, unknown> {
    const entries = this.list();
    const result: Record<string, unknown> = {};
    for (const entry of entries) {
      result[entry.key] = entry.value;
    }
    return result;
  }

  /** Import config from a plain object. Dangerous keys are skipped. */
  importData(data: Record<string, unknown>, scope = 'global'): { imported: number; skipped: string[] } {
    const skipped: string[] = [];
    let imported = 0;

    for (const [key, value] of Object.entries(data)) {
      if (ConfigDAO.isDangerousKey(key)) {
        skipped.push(key);
        continue;
      }
      this.stmts.upsert.run({
        key,
        value: JSON.stringify(value),
        scope,
        updatedAt: new Date().toISOString(),
      });
      imported++;
    }

    return { imported, skipped };
  }

  // ---- Security ------------------------------------------------------------

  private static isDangerousKey(key: string): boolean {
    const lower = key.toLowerCase();
    return DANGEROUS_KEYS.has(key) ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('api_key') ||
      lower.includes('apikey') ||
      lower.includes('token') ||
      lower.includes('credential');
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): ConfigEntry {
    return {
      key: row.key,
      value: ConfigDAO.parseJSON(row.value, row.value),
      scope: row.scope,
      updatedAt: row.updated_at,
    };
  }

  private static parseJSON<T>(text: string | null | undefined, fallback: T): T {
    if (!text) return fallback;
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }
}
