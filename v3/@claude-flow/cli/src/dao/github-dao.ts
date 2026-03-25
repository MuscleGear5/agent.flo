/**
 * GitHubDAO — Data Access Object for the `github` table.
 *
 * Generic typed-blob store for repos, PRs, and issues.
 * Data is stored as JSON in the `data` column.
 *
 * @module v3/cli/dao/github-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GitHubRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class GitHubDAO {
  private stmts: {
    get: Database.Statement;
    list: Database.Statement;
    listByType: Database.Statement;
    upsert: Database.Statement;
    delete: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.stmts = {
      get: db.prepare(
        `SELECT * FROM github WHERE id = ?`
      ),
      list: db.prepare(
        `SELECT * FROM github ORDER BY updated_at DESC`
      ),
      listByType: db.prepare(
        `SELECT * FROM github WHERE type = ? ORDER BY updated_at DESC`
      ),
      upsert: db.prepare(`
        INSERT INTO github (id, type, data, updated_at)
        VALUES (@id, @type, @data, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          type = @type, data = @data, updated_at = @updatedAt
      `),
      delete: db.prepare(
        `DELETE FROM github WHERE id = ?`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(type: string, id: string): GitHubRecord | null {
    const row = this.stmts.get.get(id) as any;
    if (!row || row.type !== type) return null;
    return GitHubDAO.fromRow(row);
  }

  getById(id: string): GitHubRecord | null {
    const row = this.stmts.get.get(id) as any;
    return row ? GitHubDAO.fromRow(row) : null;
  }

  list(type?: string): GitHubRecord[] {
    const rows = type
      ? this.stmts.listByType.all(type)
      : this.stmts.list.all();
    return (rows as any[]).map(GitHubDAO.fromRow);
  }

  // ---- Writes --------------------------------------------------------------

  upsert(type: string, id: string, data: Record<string, unknown>): void {
    this.stmts.upsert.run({
      id,
      type,
      data: JSON.stringify(data),
      updatedAt: new Date().toISOString(),
    });
  }

  delete(type: string, id: string): boolean {
    const existing = this.get(type, id);
    if (!existing) return false;
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  deleteById(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): GitHubRecord {
    return {
      id: row.id,
      type: row.type,
      data: GitHubDAO.parseJSON(row.data, {}),
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
