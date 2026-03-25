/**
 * NeuralDAO — Data Access Object for the `neural` table.
 *
 * Stores models and patterns as typed JSON blobs, same pattern as GitHubDAO.
 *
 * @module v3/cli/dao/neural-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NeuralRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class NeuralDAO {
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
        `SELECT * FROM neural WHERE id = ?`
      ),
      list: db.prepare(
        `SELECT * FROM neural ORDER BY updated_at DESC`
      ),
      listByType: db.prepare(
        `SELECT * FROM neural WHERE type = ? ORDER BY updated_at DESC`
      ),
      upsert: db.prepare(`
        INSERT INTO neural (id, type, data, updated_at)
        VALUES (@id, @type, @data, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          type = @type, data = @data, updated_at = @updatedAt
      `),
      delete: db.prepare(
        `DELETE FROM neural WHERE id = ?`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(id: string): NeuralRecord | null {
    const row = this.stmts.get.get(id) as any;
    return row ? NeuralDAO.fromRow(row) : null;
  }

  list(type?: string): NeuralRecord[] {
    const rows = type
      ? this.stmts.listByType.all(type)
      : this.stmts.list.all();
    return (rows as any[]).map(NeuralDAO.fromRow);
  }

  listModels(): NeuralRecord[] {
    return this.list('model');
  }

  listPatterns(): NeuralRecord[] {
    return this.list('pattern');
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

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): NeuralRecord {
    return {
      id: row.id,
      type: row.type,
      data: NeuralDAO.parseJSON(row.data, {}),
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
