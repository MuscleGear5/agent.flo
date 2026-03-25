/**
 * SessionDAO — Data Access Object for the `sessions` table.
 *
 * save() atomically snapshots agents + tasks + memory into the session metadata.
 * restore() atomically writes the snapshot back.
 *
 * @module v3/cli/dao/session-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  name: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  restoredAt: string | null;
}

export interface SessionInput {
  id?: string;
  name: string;
  description?: string;
  includeMemory?: boolean;
  includeTasks?: boolean;
  includeAgents?: boolean;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class SessionDAO {
  private stmts: {
    list: Database.Statement;
    get: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    delete: Database.Statement;
    snapshotAgents: Database.Statement;
    snapshotTasks: Database.Statement;
    snapshotMemory: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(
        `SELECT * FROM sessions ORDER BY updated_at DESC`
      ),
      get: db.prepare(
        `SELECT * FROM sessions WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT INTO sessions (id, name, status, metadata, created_at, updated_at, restored_at)
        VALUES (@id, @name, @status, @metadata, @createdAt, @updatedAt, @restoredAt)
      `),
      update: db.prepare(`
        UPDATE sessions SET name = coalesce(@name, name),
          status = coalesce(@status, status),
          metadata = coalesce(@metadata, metadata),
          updated_at = @updatedAt,
          restored_at = coalesce(@restoredAt, restored_at)
        WHERE id = @id
      `),
      delete: db.prepare(
        `DELETE FROM sessions WHERE id = ?`
      ),
      // Snapshot queries: grab the current state from other tables
      snapshotAgents: db.prepare(
        `SELECT * FROM agents WHERE status != 'terminated'`
      ),
      snapshotTasks: db.prepare(
        `SELECT * FROM tasks`
      ),
      snapshotMemory: db.prepare(
        `SELECT * FROM memory`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  list(limit = 10): SessionRecord[] {
    const rows = this.stmts.list.all() as any[];
    return rows.slice(0, limit).map(SessionDAO.fromRow);
  }

  get(id: string): SessionRecord | null {
    const row = this.stmts.get.get(id);
    return row ? SessionDAO.fromRow(row as any) : null;
  }

  getByName(name: string): SessionRecord | null {
    const row = this.db.prepare(
      `SELECT * FROM sessions WHERE name = ? ORDER BY updated_at DESC LIMIT 1`
    ).get(name);
    return row ? SessionDAO.fromRow(row as any) : null;
  }

  getLatest(): SessionRecord | null {
    const row = this.db.prepare(
      `SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1`
    ).get();
    return row ? SessionDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  /**
   * Atomically save the current state as a session.
   * Snapshots agents, tasks, and memory into the metadata JSON column.
   */
  save(input: SessionInput): SessionRecord {
    const now = new Date().toISOString();
    const id = input.id ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const saveTx = this.db.transaction(() => {
      const snapshot: Record<string, unknown> = {
        description: input.description ?? null,
      };

      if (input.includeAgents !== false) {
        snapshot.agents = this.stmts.snapshotAgents.all();
      }
      if (input.includeTasks !== false) {
        snapshot.tasks = this.stmts.snapshotTasks.all();
      }
      if (input.includeMemory !== false) {
        snapshot.memory = this.stmts.snapshotMemory.all();
      }

      const stats = {
        agents: Array.isArray(snapshot.agents) ? (snapshot.agents as any[]).length : 0,
        tasks: Array.isArray(snapshot.tasks) ? (snapshot.tasks as any[]).length : 0,
        memoryEntries: Array.isArray(snapshot.memory) ? (snapshot.memory as any[]).length : 0,
      };
      snapshot.stats = stats;

      this.stmts.insert.run({
        id,
        name: input.name,
        status: 'saved',
        metadata: JSON.stringify(snapshot),
        createdAt: now,
        updatedAt: now,
        restoredAt: null,
      });
    });

    saveTx();
    return this.get(id)!;
  }

  /**
   * Restore a session: write the snapshot back into the live tables.
   * This is a destructive operation — it replaces current state.
   */
  restore(id: string): boolean {
    const session = this.get(id);
    if (!session) return false;

    const meta = session.metadata;

    const restoreTx = this.db.transaction(() => {
      const now = new Date().toISOString();

      // Restore agents
      if (Array.isArray(meta.agents)) {
        this.db.prepare(`DELETE FROM agents`).run();
        const insertAgent = this.db.prepare(`
          INSERT INTO agents (id, type, name, status, capabilities, current_task,
            parent_id, provider, model, task_count, completed_tasks, metadata,
            created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of meta.agents as any[]) {
          insertAgent.run(
            a.id, a.type, a.name, a.status, a.capabilities,
            a.current_task, a.parent_id, a.provider, a.model,
            a.task_count, a.completed_tasks, a.metadata,
            a.created_at, a.updated_at,
          );
        }
      }

      // Restore tasks
      if (Array.isArray(meta.tasks)) {
        this.db.prepare(`DELETE FROM tasks`).run();
        const insertTask = this.db.prepare(`
          INSERT INTO tasks (id, type, description, status, priority, assigned_agent,
            parent_task, dependencies, input, output, error, retry_count,
            created_at, updated_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of meta.tasks as any[]) {
          insertTask.run(
            t.id, t.type, t.description, t.status, t.priority,
            t.assigned_agent, t.parent_task, t.dependencies, t.input,
            t.output, t.error, t.retry_count, t.created_at,
            t.updated_at, t.started_at, t.completed_at,
          );
        }
      }

      // Restore memory
      if (Array.isArray(meta.memory)) {
        this.db.prepare(`DELETE FROM memory`).run();
        const insertMem = this.db.prepare(`
          INSERT INTO memory (id, key, value, namespace, type, tags, owner_id,
            access_level, ttl, created_at, updated_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of meta.memory as any[]) {
          insertMem.run(
            m.id, m.key, m.value, m.namespace, m.type, m.tags,
            m.owner_id, m.access_level, m.ttl, m.created_at,
            m.updated_at, m.expires_at,
          );
        }
      }

      // Mark session as restored
      this.stmts.update.run({
        id,
        name: null,
        status: 'restored',
        metadata: null,
        updatedAt: now,
        restoredAt: now,
      });
    });

    restoreTx();
    return true;
  }

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): SessionRecord {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      metadata: SessionDAO.parseJSON(row.metadata, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      restoredAt: row.restored_at,
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
