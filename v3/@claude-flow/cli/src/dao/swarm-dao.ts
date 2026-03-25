/**
 * SwarmDAO — Data Access Object for the `swarm` table.
 *
 * Typically a single row (id = 'default') representing the active swarm,
 * though multi-swarm is supported by the schema.
 *
 * @module v3/cli/dao/swarm-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types — match the shape used by swarm-tools.ts
// ---------------------------------------------------------------------------

export interface SwarmRecord {
  id: string;
  topology: string;
  status: string;
  maxAgents: number;
  strategy: string;
  nodes: Record<string, unknown>;
  connections: unknown[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmInitInput {
  id?: string;
  topology?: string;
  maxAgents?: number;
  strategy?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class SwarmDAO {
  private stmts: {
    get: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    delete: Database.Statement;
    list: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.stmts = {
      get: db.prepare(
        `SELECT * FROM swarm WHERE id = ?`
      ),
      insert: db.prepare(`
        INSERT OR REPLACE INTO swarm (id, topology, status, max_agents, strategy,
          nodes, connections, metadata, created_at, updated_at)
        VALUES (@id, @topology, @status, @maxAgents, @strategy,
          @nodes, @connections, @metadata, @createdAt, @updatedAt)
      `),
      update: db.prepare(`
        UPDATE swarm
        SET topology = coalesce(@topology, topology),
            status = coalesce(@status, status),
            max_agents = coalesce(@maxAgents, max_agents),
            strategy = coalesce(@strategy, strategy),
            nodes = coalesce(@nodes, nodes),
            connections = coalesce(@connections, connections),
            metadata = coalesce(@metadata, metadata),
            updated_at = @updatedAt
        WHERE id = @id
      `),
      delete: db.prepare(
        `DELETE FROM swarm WHERE id = ?`
      ),
      list: db.prepare(
        `SELECT * FROM swarm ORDER BY created_at DESC`
      ),
    };
  }

  // ---- Reads ---------------------------------------------------------------

  get(id = 'default'): SwarmRecord | null {
    const row = this.stmts.get.get(id);
    return row ? SwarmDAO.fromRow(row as any) : null;
  }

  list(): SwarmRecord[] {
    const rows = this.stmts.list.all();
    return (rows as any[]).map(SwarmDAO.fromRow);
  }

  // ---- Writes --------------------------------------------------------------

  init(input: SwarmInitInput = {}): SwarmRecord {
    const now = new Date().toISOString();
    const id = input.id ?? 'default';

    this.stmts.insert.run({
      id,
      topology: input.topology ?? 'hierarchical',
      status: 'initializing',
      maxAgents: input.maxAgents ?? 10,
      strategy: input.strategy ?? 'specialized',
      nodes: JSON.stringify({}),
      connections: JSON.stringify([]),
      metadata: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
    });

    return this.get(id)!;
  }

  update(id: string, changes: Partial<Omit<SwarmRecord, 'id' | 'createdAt'>>): boolean {
    const now = new Date().toISOString();
    const info = this.stmts.update.run({
      id,
      topology: changes.topology ?? null,
      status: changes.status ?? null,
      maxAgents: changes.maxAgents ?? null,
      strategy: changes.strategy ?? null,
      nodes: changes.nodes ? JSON.stringify(changes.nodes) : null,
      connections: changes.connections ? JSON.stringify(changes.connections) : null,
      metadata: changes.metadata ? JSON.stringify(changes.metadata) : null,
      updatedAt: now,
    });
    return info.changes > 0;
  }

  addAgent(swarmId: string, agentId: string): boolean {
    const swarm = this.get(swarmId);
    if (!swarm) return false;

    const nodes = { ...swarm.nodes };
    nodes[agentId] = { joinedAt: new Date().toISOString(), status: 'active' };

    return this.update(swarmId, { nodes });
  }

  removeAgent(swarmId: string, agentId: string): boolean {
    const swarm = this.get(swarmId);
    if (!swarm) return false;

    const nodes = { ...swarm.nodes };
    delete nodes[agentId];

    return this.update(swarmId, { nodes });
  }

  stop(id = 'default'): boolean {
    return this.update(id, { status: 'terminated' });
  }

  delete(id: string): boolean {
    const info = this.stmts.delete.run(id);
    return info.changes > 0;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromRow(row: any): SwarmRecord {
    return {
      id: row.id,
      topology: row.topology,
      status: row.status,
      maxAgents: row.max_agents,
      strategy: row.strategy,
      nodes: SwarmDAO.parseJSON(row.nodes, {}),
      connections: SwarmDAO.parseJSON(row.connections, []),
      metadata: SwarmDAO.parseJSON(row.metadata, {}),
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
