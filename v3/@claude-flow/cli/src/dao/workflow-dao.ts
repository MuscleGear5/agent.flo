/**
 * WorkflowDAO — Data Access Object for the `workflows` table.
 *
 * Wraps prepared statements for workflow lifecycle management.
 * JSON columns (steps, context, results) are stored as TEXT.
 *
 * @module v3/cli/dao/workflow-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match shapes used by workflow-tools.ts
// ---------------------------------------------------------------------------

export interface WorkflowRecord {
  id: string;
  name: string | null;
  status: string;
  steps: unknown[];
  currentStep: number;
  context: Record<string, unknown>;
  results: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInput {
  id?: string;
  name?: string;
  status?: string;
  steps: unknown[];
  currentStep?: number;
  context?: Record<string, unknown>;
  results?: Record<string, unknown>;
}

export interface WorkflowUpdate {
  name?: string;
  status?: string;
  steps?: unknown[];
  currentStep?: number;
  context?: Record<string, unknown>;
  results?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class WorkflowDAO {
  private stmts: {
    list: Database.Statement;
    listByStatus: Database.Statement;
    get: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    delete: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(
        `SELECT * FROM workflows ORDER BY created_at DESC`
      ),
      listByStatus: db.prepare(
        `SELECT * FROM workflows WHERE status = ? ORDER BY created_at DESC`
      ),
      get: db.prepare(
        `SELECT * FROM workflows WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT INTO workflows (id, name, status, steps, current_step,
          context, results, created_at, updated_at)
        VALUES (@id, @name, @status, @steps, @currentStep,
          @context, @results, @createdAt, @updatedAt)
      `),
      update: db.prepare(`
        UPDATE workflows
        SET name = coalesce(@name, name),
            status = coalesce(@status, status),
            steps = coalesce(@steps, steps),
            current_step = coalesce(@currentStep, current_step),
            context = coalesce(@context, context),
            results = coalesce(@results, results),
            updated_at = @updatedAt
        WHERE id = @id
      `),
      delete: db.prepare(`DELETE FROM workflows WHERE id = ?`),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  list(status?: string): WorkflowRecord[] {
    const rows = status
      ? this.stmts.listByStatus.all(status)
      : this.stmts.list.all();
    return (rows as any[]).map(WorkflowDAO.fromRow);
  }

  get(id: string): WorkflowRecord | null {
    const row = this.stmts.get.get(id);
    return row ? WorkflowDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  create(input: WorkflowInput): WorkflowRecord {
    const now = new Date().toISOString();
    const id = input.id ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.stmts.insert.run({
      id,
      name: input.name ?? null,
      status: input.status ?? 'pending',
      steps: JSON.stringify(input.steps),
      currentStep: input.currentStep ?? 0,
      context: JSON.stringify(input.context ?? {}),
      results: JSON.stringify(input.results ?? {}),
      createdAt: now,
      updatedAt: now,
    });

    return this.get(id)!;
  }

  update(id: string, changes: WorkflowUpdate): boolean {
    const now = new Date().toISOString();
    const info = this.stmts.update.run({
      id,
      name: changes.name ?? null,
      status: changes.status ?? null,
      steps: changes.steps ? JSON.stringify(changes.steps) : null,
      currentStep: changes.currentStep ?? null,
      context: changes.context ? JSON.stringify(changes.context) : null,
      results: changes.results ? JSON.stringify(changes.results) : null,
      updatedAt: now,
    });
    return info.changes > 0;
  }

  /** Advance to the next step. */
  advanceStep(id: string): boolean {
    const wf = this.get(id);
    if (!wf) return false;
    return this.update(id, { currentStep: wf.currentStep + 1 });
  }

  /** Mark workflow completed with final results. */
  complete(id: string, results?: Record<string, unknown>): boolean {
    return this.update(id, { status: 'completed', results });
  }

  /** Mark workflow failed with error info. */
  fail(id: string, error: string): boolean {
    return this.update(id, {
      status: 'failed',
      results: { error },
    });
  }

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): WorkflowRecord {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      steps: WorkflowDAO.parseJSON(row.steps, []),
      currentStep: row.current_step ?? 0,
      context: WorkflowDAO.parseJSON(row.context, {}),
      results: WorkflowDAO.parseJSON(row.results, {}),
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
