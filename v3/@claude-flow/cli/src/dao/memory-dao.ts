/**
 * MemoryDAO — Data Access Object for the `memory` table.
 *
 * Provides key/value storage with namespace support, TTL, and basic search.
 * Compatible with the existing sql.js migration path in memory-tools.ts.
 *
 * @module v3/cli/dao/memory-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryRecord {
  id: string;
  key: string;
  value: string;
  namespace: string;
  type: string;
  tags: string[];
  ownerId: string | null;
  accessLevel: string;
  ttl: number | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface MemoryInput {
  key: string;
  value: string;
  namespace?: string;
  type?: string;
  tags?: string[];
  ownerId?: string;
  accessLevel?: string;
  ttl?: number;
}

export interface MemoryStats {
  total: number;
  byNamespace: Record<string, number>;
  byType: Record<string, number>;
  expired: number;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class MemoryDAO {
  private stmts: {
    list: Database.Statement;
    listByNamespace: Database.Statement;
    getByKey: Database.Statement;
    getById: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    deleteByKey: Database.Statement;
    deleteById: Database.Statement;
    search: Database.Statement;
    countByNamespace: Database.Statement;
    countByType: Database.Statement;
    countExpired: Database.Statement;
    deleteExpired: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(
        `SELECT * FROM memory ORDER BY updated_at DESC`
      ),
      listByNamespace: db.prepare(
        `SELECT * FROM memory WHERE namespace = ? ORDER BY updated_at DESC`
      ),
      getByKey: db.prepare(
        `SELECT * FROM memory WHERE key = ? AND namespace = ?`
      ),
      getById: db.prepare(
        `SELECT * FROM memory WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT INTO memory (id, key, value, namespace, type, tags, owner_id,
          access_level, ttl, created_at, updated_at, expires_at)
        VALUES (@id, @key, @value, @namespace, @type, @tags, @ownerId,
          @accessLevel, @ttl, @createdAt, @updatedAt, @expiresAt)
      `),
      update: db.prepare(`
        UPDATE memory SET value = @value, tags = coalesce(@tags, tags),
          type = coalesce(@type, type), updated_at = @updatedAt
        WHERE key = @key AND namespace = @namespace
      `),
      deleteByKey: db.prepare(
        `DELETE FROM memory WHERE key = ? AND namespace = ?`
      ),
      deleteById: db.prepare(
        `DELETE FROM memory WHERE id = ?`
      ),
      search: db.prepare(
        `SELECT * FROM memory WHERE (key LIKE ? OR value LIKE ?) AND namespace = ? ORDER BY updated_at DESC LIMIT ?`
      ),
      countByNamespace: db.prepare(
        `SELECT namespace, COUNT(*) as count FROM memory GROUP BY namespace`
      ),
      countByType: db.prepare(
        `SELECT type, COUNT(*) as count FROM memory GROUP BY type`
      ),
      countExpired: db.prepare(
        `SELECT COUNT(*) as count FROM memory WHERE expires_at IS NOT NULL AND expires_at < ?`
      ),
      deleteExpired: db.prepare(
        `DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < ?`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  list(namespace?: string, limit = 100): MemoryRecord[] {
    const rows = namespace
      ? this.stmts.listByNamespace.all(namespace)
      : this.stmts.list.all();
    return (rows as any[]).slice(0, limit).map(MemoryDAO.fromRow);
  }

  get(key: string, namespace = 'default'): MemoryRecord | null {
    const row = this.stmts.getByKey.get(key, namespace);
    return row ? MemoryDAO.fromRow(row as any) : null;
  }

  getById(id: string): MemoryRecord | null {
    const row = this.stmts.getById.get(id);
    return row ? MemoryDAO.fromRow(row as any) : null;
  }

  /**
   * Basic LIKE-based search. For vector/semantic search, use the HNSW
   * backend in @claude-flow/memory.
   */
  search(query: string, namespace = 'default', limit = 20): MemoryRecord[] {
    const pattern = `%${query}%`;
    const rows = this.stmts.search.all(pattern, pattern, namespace, limit);
    return (rows as any[]).map(MemoryDAO.fromRow);
  }

  // ---- Writes --------------------------------------------------------------

  store(input: MemoryInput): MemoryRecord {
    const now = new Date().toISOString();
    const namespace = input.namespace ?? 'default';
    const existing = this.get(input.key, namespace);

    if (existing) {
      this.stmts.update.run({
        key: input.key,
        namespace,
        value: input.value,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        type: input.type ?? null,
        updatedAt: now,
      });
      return this.get(input.key, namespace)!;
    }

    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let expiresAt: string | null = null;
    if (input.ttl) {
      expiresAt = new Date(Date.now() + input.ttl * 1000).toISOString();
    }

    this.stmts.insert.run({
      id,
      key: input.key,
      value: input.value,
      namespace,
      type: input.type ?? 'semantic',
      tags: JSON.stringify(input.tags ?? []),
      ownerId: input.ownerId ?? null,
      accessLevel: input.accessLevel ?? 'private',
      ttl: input.ttl ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    return this.get(input.key, namespace)!;
  }

  delete(key: string, namespace = 'default'): boolean {
    const info = this.stmts.deleteByKey.run(key, namespace);
    return info.changes > 0;
  }

  deleteById(id: string): boolean {
    const info = this.stmts.deleteById.run(id);
    return info.changes > 0;
  }

  /** Remove entries past their TTL. */
  pruneExpired(): number {
    const now = new Date().toISOString();
    const info = this.stmts.deleteExpired.run(now);
    return info.changes;
  }

  // ---- Aggregates ----------------------------------------------------------

  stats(): MemoryStats {
    const nsRows = this.stmts.countByNamespace.all() as Array<{ namespace: string; count: number }>;
    const typeRows = this.stmts.countByType.all() as Array<{ type: string; count: number }>;
    const expiredRow = this.stmts.countExpired.get(new Date().toISOString()) as { count: number };

    const byNamespace: Record<string, number> = {};
    let total = 0;
    for (const r of nsRows) {
      byNamespace[r.namespace] = r.count;
      total += r.count;
    }

    const byType: Record<string, number> = {};
    for (const r of typeRows) {
      byType[r.type] = r.count;
    }

    return { total, byNamespace, byType, expired: expiredRow?.count ?? 0 };
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): MemoryRecord {
    return {
      id: row.id,
      key: row.key,
      value: row.value,
      namespace: row.namespace,
      type: row.type,
      tags: MemoryDAO.parseJSON(row.tags, []),
      ownerId: row.owner_id,
      accessLevel: row.access_level,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
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
