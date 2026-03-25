/**
 * HiveMindDAO — Data Access Object for the `hive_mind` table.
 *
 * Wraps prepared statements for collective intelligence state management.
 * JSON columns (workers, consensus_state, proposals, broadcast_log) are
 * stored as TEXT and parsed on read.
 *
 * @module v3/cli/dao/hive-mind-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match shapes used by hive-mind-tools.ts
// ---------------------------------------------------------------------------

export interface HiveMindRecord {
  id: string;
  queenId: string | null;
  status: string;
  workers: string[];
  consensusState: Record<string, unknown>;
  proposals: unknown[];
  broadcastLog: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface HiveMindInput {
  id?: string;
  queenId?: string | null;
  status?: string;
  workers?: string[];
  consensusState?: Record<string, unknown>;
  proposals?: unknown[];
  broadcastLog?: unknown[];
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class HiveMindDAO {
  private stmts: {
    get: Database.Statement;
    upsert: Database.Statement;
    updateStatus: Database.Statement;
    setQueen: Database.Statement;
    delete: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      get: db.prepare(`SELECT * FROM hive_mind WHERE id = ?`),
      upsert: db.prepare(`
        INSERT INTO hive_mind (id, queen_id, status, workers, consensus_state,
          proposals, broadcast_log, created_at, updated_at)
        VALUES (@id, @queenId, @status, @workers, @consensusState,
          @proposals, @broadcastLog, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          queen_id = excluded.queen_id,
          status = excluded.status,
          workers = excluded.workers,
          consensus_state = excluded.consensus_state,
          proposals = excluded.proposals,
          broadcast_log = excluded.broadcast_log,
          updated_at = excluded.updated_at
      `),
      updateStatus: db.prepare(
        `UPDATE hive_mind SET status = ?, updated_at = ? WHERE id = ?`
      ),
      setQueen: db.prepare(
        `UPDATE hive_mind SET queen_id = ?, updated_at = ? WHERE id = ?`
      ),
      delete: db.prepare(`DELETE FROM hive_mind WHERE id = ?`),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(id: string = 'default'): HiveMindRecord | null {
    const row = this.stmts.get.get(id);
    return row ? HiveMindDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  save(input: HiveMindInput): HiveMindRecord {
    const now = new Date().toISOString();
    const id = input.id ?? 'default';

    this.stmts.upsert.run({
      id,
      queenId: input.queenId ?? null,
      status: input.status ?? 'inactive',
      workers: JSON.stringify(input.workers ?? []),
      consensusState: JSON.stringify(input.consensusState ?? {}),
      proposals: JSON.stringify(input.proposals ?? []),
      broadcastLog: JSON.stringify(input.broadcastLog ?? []),
      createdAt: now,
      updatedAt: now,
    });

    return this.get(id)!;
  }

  setStatus(id: string, status: string): boolean {
    const info = this.stmts.updateStatus.run(status, new Date().toISOString(), id);
    return info.changes > 0;
  }

  setQueen(id: string, queenId: string): boolean {
    const info = this.stmts.setQueen.run(queenId, new Date().toISOString(), id);
    return info.changes > 0;
  }

  /** Add a worker to the workers array. */
  addWorker(hiveMindId: string, workerId: string): boolean {
    const record = this.get(hiveMindId);
    if (!record) return false;

    if (!record.workers.includes(workerId)) {
      record.workers.push(workerId);
    }
    this.save({ ...record, id: hiveMindId, workers: record.workers });
    return true;
  }

  /** Remove a worker from the workers array. */
  removeWorker(hiveMindId: string, workerId: string): boolean {
    const record = this.get(hiveMindId);
    if (!record) return false;

    record.workers = record.workers.filter(w => w !== workerId);
    this.save({ ...record, id: hiveMindId, workers: record.workers });
    return true;
  }

  /** Append a proposal to the proposals array. */
  addProposal(hiveMindId: string, proposal: unknown): boolean {
    const record = this.get(hiveMindId);
    if (!record) return false;

    record.proposals.push(proposal);
    this.save({ ...record, id: hiveMindId, proposals: record.proposals });
    return true;
  }

  /** Append an entry to the broadcast log. */
  appendBroadcast(hiveMindId: string, entry: unknown): boolean {
    const record = this.get(hiveMindId);
    if (!record) return false;

    record.broadcastLog.push(entry);
    this.save({ ...record, id: hiveMindId, broadcastLog: record.broadcastLog });
    return true;
  }

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): HiveMindRecord {
    return {
      id: row.id,
      queenId: row.queen_id,
      status: row.status,
      workers: HiveMindDAO.parseJSON(row.workers, []),
      consensusState: HiveMindDAO.parseJSON(row.consensus_state, {}),
      proposals: HiveMindDAO.parseJSON(row.proposals, []),
      broadcastLog: HiveMindDAO.parseJSON(row.broadcast_log, []),
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
