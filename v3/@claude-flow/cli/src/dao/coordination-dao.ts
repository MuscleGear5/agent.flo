/**
 * CoordinationDAO — Data Access Object for the `coordination` table.
 *
 * Wraps prepared statements for swarm coordination state.
 * JSON columns (load_balance, sync_state, nodes, consensus) stored as TEXT.
 *
 * @module v3/cli/dao/coordination-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match shapes used by coordination-tools.ts
// ---------------------------------------------------------------------------

export interface CoordinationRecord {
  id: string;
  topologyType: string;
  maxNodes: number;
  loadBalance: Record<string, unknown>;
  syncState: Record<string, unknown>;
  nodes: Record<string, unknown>;
  consensus: Record<string, unknown>;
  version: string | null;
  updatedAt: string;
}

export interface CoordinationInput {
  id?: string;
  topologyType?: string;
  maxNodes?: number;
  loadBalance?: Record<string, unknown>;
  syncState?: Record<string, unknown>;
  nodes?: Record<string, unknown>;
  consensus?: Record<string, unknown>;
  version?: string | null;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class CoordinationDAO {
  private stmts: {
    get: Database.Statement;
    upsert: Database.Statement;
    delete: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      get: db.prepare(`SELECT * FROM coordination WHERE id = ?`),
      upsert: db.prepare(`
        INSERT INTO coordination (id, topology_type, max_nodes, load_balance,
          sync_state, nodes, consensus, version, updated_at)
        VALUES (@id, @topologyType, @maxNodes, @loadBalance,
          @syncState, @nodes, @consensus, @version, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          topology_type = excluded.topology_type,
          max_nodes = excluded.max_nodes,
          load_balance = excluded.load_balance,
          sync_state = excluded.sync_state,
          nodes = excluded.nodes,
          consensus = excluded.consensus,
          version = excluded.version,
          updated_at = excluded.updated_at
      `),
      delete: db.prepare(`DELETE FROM coordination WHERE id = ?`),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(id: string = 'default'): CoordinationRecord | null {
    const row = this.stmts.get.get(id);
    return row ? CoordinationDAO.fromRow(row as any) : null;
  }

  // ---- Writes --------------------------------------------------------------

  save(input: CoordinationInput): CoordinationRecord {
    const now = new Date().toISOString();
    const id = input.id ?? 'default';

    this.stmts.upsert.run({
      id,
      topologyType: input.topologyType ?? 'hierarchical',
      maxNodes: input.maxNodes ?? 10,
      loadBalance: JSON.stringify(input.loadBalance ?? {}),
      syncState: JSON.stringify(input.syncState ?? {}),
      nodes: JSON.stringify(input.nodes ?? {}),
      consensus: JSON.stringify(input.consensus ?? {}),
      version: input.version ?? null,
      updatedAt: now,
    });

    return this.get(id)!;
  }

  /** Update topology type. */
  setTopology(id: string, topologyType: string, maxNodes?: number): boolean {
    const record = this.get(id);
    if (!record) return false;
    this.save({
      id,
      topologyType,
      maxNodes: maxNodes ?? record.maxNodes,
      loadBalance: record.loadBalance,
      syncState: record.syncState,
      nodes: record.nodes,
      consensus: record.consensus,
      version: record.version ?? undefined,
    });
    return true;
  }

  /** Update load balance configuration. */
  setLoadBalance(id: string, loadBalance: Record<string, unknown>): boolean {
    const record = this.get(id);
    if (!record) return false;
    this.save({ ...record, id, loadBalance });
    return true;
  }

  /** Update sync state. */
  setSyncState(id: string, syncState: Record<string, unknown>): boolean {
    const record = this.get(id);
    if (!record) return false;
    this.save({ ...record, id, syncState });
    return true;
  }

  /** Add or update a node. */
  setNode(id: string, nodeId: string, nodeData: Record<string, unknown>): boolean {
    const record = this.get(id);
    if (!record) return false;
    const nodes = { ...record.nodes, [nodeId]: nodeData };
    this.save({ ...record, id, nodes });
    return true;
  }

  /** Remove a node. */
  removeNode(id: string, nodeId: string): boolean {
    const record = this.get(id);
    if (!record) return false;
    const nodes = { ...record.nodes };
    delete nodes[nodeId];
    this.save({ ...record, id, nodes });
    return true;
  }

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): CoordinationRecord {
    return {
      id: row.id,
      topologyType: row.topology_type,
      maxNodes: row.max_nodes ?? 10,
      loadBalance: CoordinationDAO.parseJSON(row.load_balance, {}),
      syncState: CoordinationDAO.parseJSON(row.sync_state, {}),
      nodes: CoordinationDAO.parseJSON(row.nodes, {}),
      consensus: CoordinationDAO.parseJSON(row.consensus, {}),
      version: row.version,
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
