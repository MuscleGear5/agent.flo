/**
 * AgentDAO — Data Access Object for the `agents` table.
 *
 * Wraps prepared statements for CRUD operations on agents.
 * JSON columns (capabilities, metadata) are stored as TEXT and parsed on read.
 *
 * @module v3/cli/dao/agent-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match the shape used by agent-tools.ts
// ---------------------------------------------------------------------------

export interface AgentRecord {
  id: string;
  type: string;
  name: string | null;
  status: string;
  capabilities: string[];
  currentTask: string | null;
  parentId: string | null;
  provider: string | null;
  model: string | null;
  taskCount: number;
  completedTasks: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInput {
  id?: string;
  type: string;
  name?: string | null;
  status?: string;
  capabilities?: string[];
  currentTask?: string | null;
  parentId?: string | null;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgHealth: number;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class AgentDAO {
  private stmts: {
    list: Database.Statement;
    listAll: Database.Statement;
    get: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    terminate: Database.Statement;
    countByStatus: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(
        `SELECT * FROM agents WHERE status != 'terminated'`
      ),
      listAll: db.prepare(
        `SELECT * FROM agents`
      ),
      get: db.prepare(
        `SELECT * FROM agents WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT INTO agents (id, type, name, status, capabilities, current_task,
          parent_id, provider, model, task_count, completed_tasks, metadata,
          created_at, updated_at)
        VALUES (@id, @type, @name, @status, @capabilities, @currentTask,
          @parentId, @provider, @model, @taskCount, @completedTasks, @metadata,
          @createdAt, @updatedAt)
      `),
      update: db.prepare(`
        UPDATE agents
        SET type = coalesce(@type, type),
            name = coalesce(@name, name),
            status = coalesce(@status, status),
            capabilities = coalesce(@capabilities, capabilities),
            current_task = coalesce(@currentTask, current_task),
            parent_id = coalesce(@parentId, parent_id),
            provider = coalesce(@provider, provider),
            model = coalesce(@model, model),
            task_count = coalesce(@taskCount, task_count),
            completed_tasks = coalesce(@completedTasks, completed_tasks),
            metadata = coalesce(@metadata, metadata),
            updated_at = @updatedAt
        WHERE id = @id
      `),
      terminate: db.prepare(
        `UPDATE agents SET status = 'terminated', updated_at = ? WHERE id = ?`
      ),
      countByStatus: db.prepare(
        `SELECT status, COUNT(*) as count FROM agents GROUP BY status`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  list(includeTerminated = false): AgentRecord[] {
    const rows = includeTerminated
      ? this.stmts.listAll.all()
      : this.stmts.list.all();
    return (rows as any[]).map(AgentDAO.fromRow);
  }

  get(id: string): AgentRecord | null {
    const row = this.stmts.get.get(id);
    return row ? AgentDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  spawn(input: AgentInput): AgentRecord {
    const now = new Date().toISOString();
    const id = input.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.stmts.insert.run({
      id,
      type: input.type,
      name: input.name ?? null,
      status: input.status ?? 'idle',
      capabilities: JSON.stringify(input.capabilities ?? []),
      currentTask: input.currentTask ?? null,
      parentId: input.parentId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      taskCount: 0,
      completedTasks: 0,
      metadata: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
    });

    return this.get(id)!;
  }

  update(id: string, changes: Partial<AgentInput> & { taskCount?: number; completedTasks?: number; status?: string }): boolean {
    const now = new Date().toISOString();
    const info = this.stmts.update.run({
      id,
      type: changes.type ?? null,
      name: changes.name ?? null,
      status: changes.status ?? null,
      capabilities: changes.capabilities ? JSON.stringify(changes.capabilities) : null,
      currentTask: changes.currentTask ?? null,
      parentId: changes.parentId ?? null,
      provider: changes.provider ?? null,
      model: changes.model ?? null,
      taskCount: changes.taskCount ?? null,
      completedTasks: changes.completedTasks ?? null,
      metadata: changes.metadata ? JSON.stringify(changes.metadata) : null,
      updatedAt: now,
    });
    return info.changes > 0;
  }

  terminate(id: string): boolean {
    const info = this.stmts.terminate.run(new Date().toISOString(), id);
    return info.changes > 0;
  }

  // ---- Aggregates ----------------------------------------------------------

  getStats(): AgentStats {
    const rows = this.stmts.countByStatus.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    const agents = this.list(false);
    const byType: Record<string, number> = {};
    for (const a of agents) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }

    return { total, byStatus, byType, avgHealth: 1.0 };
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): AgentRecord {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      status: row.status,
      capabilities: AgentDAO.parseJSON(row.capabilities, []),
      currentTask: row.current_task,
      parentId: row.parent_id,
      provider: row.provider,
      model: row.model,
      taskCount: row.task_count ?? 0,
      completedTasks: row.completed_tasks ?? 0,
      metadata: AgentDAO.parseJSON(row.metadata, {}),
      createdAt: row.created_at,
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
