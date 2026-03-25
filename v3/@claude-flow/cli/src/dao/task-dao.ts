/**
 * TaskDAO — Data Access Object for the `tasks` table.
 *
 * Wraps prepared statements for CRUD operations on tasks.
 * Critical: complete() uses db.transaction() to atomically update both the
 * task AND the assigned agent — this fixes the current race condition bug.
 *
 * @module v3/cli/dao/task-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match the shape used by task-tools.ts
// ---------------------------------------------------------------------------

export interface TaskRecord {
  id: string;
  type: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgent: string | null;
  parentTask: string | null;
  dependencies: string[];
  input: unknown;
  output: unknown;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskInput {
  id?: string;
  type: string;
  description: string;
  priority?: string;
  assignedAgent?: string;
  parentTask?: string;
  dependencies?: string[];
  input?: unknown;
  tags?: string[];
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class TaskDAO {
  private stmts: {
    list: Database.Statement;
    listByStatus: Database.Statement;
    get: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    setCompleted: Database.Statement;
    agentCompleteTask: Database.Statement;
    countByStatus: Database.Statement;
    countByPriority: Database.Statement;
  };

  private completeTransaction: Database.Transaction<(taskId: string, output: unknown) => void>;

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(
        `SELECT * FROM tasks ORDER BY created_at DESC`
      ),
      listByStatus: db.prepare(
        `SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC`
      ),
      get: db.prepare(
        `SELECT * FROM tasks WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT INTO tasks (id, type, description, status, priority, assigned_agent,
          parent_task, dependencies, input, output, error, retry_count,
          created_at, updated_at, started_at, completed_at)
        VALUES (@id, @type, @description, @status, @priority, @assignedAgent,
          @parentTask, @dependencies, @input, @output, @error, @retryCount,
          @createdAt, @updatedAt, @startedAt, @completedAt)
      `),
      update: db.prepare(`
        UPDATE tasks
        SET type = coalesce(@type, type),
            description = coalesce(@description, description),
            status = coalesce(@status, status),
            priority = coalesce(@priority, priority),
            assigned_agent = coalesce(@assignedAgent, assigned_agent),
            parent_task = coalesce(@parentTask, parent_task),
            dependencies = coalesce(@dependencies, dependencies),
            input = coalesce(@input, input),
            output = coalesce(@output, output),
            error = coalesce(@error, error),
            retry_count = coalesce(@retryCount, retry_count),
            started_at = coalesce(@startedAt, started_at),
            completed_at = coalesce(@completedAt, completed_at),
            updated_at = @updatedAt
        WHERE id = @id
      `),
      setCompleted: db.prepare(`
        UPDATE tasks
        SET status = 'completed', progress = 100, output = ?,
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `),
      agentCompleteTask: db.prepare(`
        UPDATE agents
        SET status = 'idle', current_task = NULL,
            task_count = task_count + 1, completed_tasks = completed_tasks + 1,
            updated_at = ?
        WHERE id = ?
      `),
      countByStatus: db.prepare(
        `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
      ),
      countByPriority: db.prepare(
        `SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority`
      ),
    };

    // Atomic transaction: update task + update agent in one shot.
    // This is the critical fix for the race condition in the old JSON store.
    this.completeTransaction = db.transaction((taskId: string, output: unknown) => {
      const now = new Date().toISOString();
      const task = this.stmts.get.get(taskId) as any;
      if (!task) throw new Error(`Task ${taskId} not found`);

      // 1. Mark task completed
      this.stmts.setCompleted.run(
        JSON.stringify(output ?? null),
        now,
        now,
        taskId,
      );

      // 2. Update the assigned agent atomically
      if (task.assigned_agent) {
        this.stmts.agentCompleteTask.run(now, task.assigned_agent);
      }
    });
  }

  // ---- Reads ---------------------------------------------------------------

  list(filters?: { status?: string; type?: string; assignedAgent?: string; priority?: string; limit?: number }): TaskRecord[] {
    let rows: any[];

    if (filters?.status) {
      rows = this.stmts.listByStatus.all(filters.status);
    } else {
      rows = this.stmts.list.all() as any[];
    }

    // Apply in-memory filters for fields without dedicated statements
    if (filters?.type) {
      rows = rows.filter((r: any) => r.type === filters.type);
    }
    if (filters?.assignedAgent) {
      rows = rows.filter((r: any) => r.assigned_agent === filters.assignedAgent);
    }
    if (filters?.priority) {
      rows = rows.filter((r: any) => r.priority === filters.priority);
    }
    if (filters?.limit) {
      rows = rows.slice(0, filters.limit);
    }

    return rows.map(TaskDAO.fromRow);
  }

  get(id: string): TaskRecord | null {
    const row = this.stmts.get.get(id);
    return row ? TaskDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  create(input: TaskInput): TaskRecord {
    const now = new Date().toISOString();
    const id = input.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.stmts.insert.run({
      id,
      type: input.type,
      description: input.description,
      status: input.assignedAgent ? 'in_progress' : 'pending',
      priority: input.priority ?? 'normal',
      assignedAgent: input.assignedAgent ?? null,
      parentTask: input.parentTask ?? null,
      dependencies: JSON.stringify(input.dependencies ?? []),
      input: JSON.stringify(input.input ?? null),
      output: null,
      error: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: input.assignedAgent ? now : null,
      completedAt: null,
    });

    return this.get(id)!;
  }

  update(id: string, changes: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>): boolean {
    const now = new Date().toISOString();
    const info = this.stmts.update.run({
      id,
      type: changes.type ?? null,
      description: changes.description ?? null,
      status: changes.status ?? null,
      priority: changes.priority ?? null,
      assignedAgent: changes.assignedAgent ?? null,
      parentTask: changes.parentTask ?? null,
      dependencies: changes.dependencies ? JSON.stringify(changes.dependencies) : null,
      input: changes.input !== undefined ? JSON.stringify(changes.input) : null,
      output: changes.output !== undefined ? JSON.stringify(changes.output) : null,
      error: changes.error ?? null,
      retryCount: changes.retryCount ?? null,
      startedAt: changes.startedAt ?? null,
      completedAt: changes.completedAt ?? null,
      updatedAt: now,
    });
    return info.changes > 0;
  }

  /**
   * Assign a task to an agent. Updates both the task's assigned_agent and
   * sets the agent's current_task + status to 'busy'.
   */
  assign(taskId: string, agentId: string): boolean {
    const assignTx = this.db.transaction(() => {
      const now = new Date().toISOString();

      // Update task
      this.db.prepare(`
        UPDATE tasks SET assigned_agent = ?, status = 'in_progress',
          started_at = coalesce(started_at, ?), updated_at = ?
        WHERE id = ?
      `).run(agentId, now, now, taskId);

      // Update agent
      this.db.prepare(`
        UPDATE agents SET status = 'busy', current_task = ?, updated_at = ?
        WHERE id = ?
      `).run(taskId, now, agentId);
    });

    assignTx();
    return true;
  }

  /**
   * Atomically mark a task completed and reset the assigned agent.
   * This is the critical fix: a single transaction replaces the old
   * two-file read-modify-write cycle that was prone to race conditions.
   */
  complete(taskId: string, output?: unknown): void {
    this.completeTransaction(taskId, output);
  }

  // ---- Aggregates ----------------------------------------------------------

  getStats(): TaskStats {
    const statusRows = this.stmts.countByStatus.all() as Array<{ status: string; count: number }>;
    const priorityRows = this.stmts.countByPriority.all() as Array<{ priority: string; count: number }>;

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    const byPriority: Record<string, number> = {};
    for (const row of priorityRows) {
      byPriority[row.priority] = row.count;
    }

    return { total, byStatus, byPriority };
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): TaskRecord {
    return {
      id: row.id,
      type: row.type,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignedAgent: row.assigned_agent,
      parentTask: row.parent_task,
      dependencies: TaskDAO.parseJSON(row.dependencies, []),
      input: TaskDAO.parseJSON(row.input, null),
      output: TaskDAO.parseJSON(row.output, null),
      error: row.error,
      retryCount: row.retry_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
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
