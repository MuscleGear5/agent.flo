/**
 * MetricsDAO — Data Access Object for the `metrics` and `routing_outcomes` tables.
 *
 * Covers: system metrics, performance metrics, progress metrics, and routing outcomes.
 * Uses append-only writes with prune support for time-series data.
 *
 * @module v3/cli/dao/metrics-dao
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MetricRecord {
  id: number;
  domain: string;
  key: string;
  value: unknown;
  timestamp: string;
}

export interface RoutingOutcome {
  id: number;
  task: string;
  model: string;
  tier: number | null;
  latencyMs: number | null;
  success: boolean;
  timestamp: string;
}

export interface MetricsQuery {
  domain: string;
  key?: string;
  since?: string;
  until?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export class MetricsDAO {
  private stmts: {
    record: Database.Statement;
    queryDomain: Database.Statement;
    queryDomainKey: Database.Statement;
    getLatest: Database.Statement;
    prune: Database.Statement;
    recordRouting: Database.Statement;
    listRouting: Database.Statement;
    pruneRouting: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.stmts = {
      record: db.prepare(`
        INSERT INTO metrics (domain, key, value, timestamp)
        VALUES (@domain, @key, @value, @timestamp)
      `),
      queryDomain: db.prepare(
        `SELECT * FROM metrics WHERE domain = ? ORDER BY timestamp DESC LIMIT ?`
      ),
      queryDomainKey: db.prepare(
        `SELECT * FROM metrics WHERE domain = ? AND key = ? ORDER BY timestamp DESC LIMIT ?`
      ),
      getLatest: db.prepare(
        `SELECT * FROM metrics WHERE domain = ? AND key = ? ORDER BY timestamp DESC LIMIT 1`
      ),
      prune: db.prepare(
        `DELETE FROM metrics WHERE timestamp < ?`
      ),
      recordRouting: db.prepare(`
        INSERT INTO routing_outcomes (task, model, tier, latency_ms, success, timestamp)
        VALUES (@task, @model, @tier, @latencyMs, @success, @timestamp)
      `),
      listRouting: db.prepare(
        `SELECT * FROM routing_outcomes ORDER BY timestamp DESC LIMIT ?`
      ),
      pruneRouting: db.prepare(
        `DELETE FROM routing_outcomes WHERE timestamp < ?`
      ),
    };
  }

  // ---- Metrics CRUD --------------------------------------------------------

  record(domain: string, key: string, value: unknown): void {
    this.stmts.record.run({
      domain,
      key,
      value: JSON.stringify(value),
      timestamp: new Date().toISOString(),
    });
  }

  query(opts: MetricsQuery): MetricRecord[] {
    const limit = opts.limit ?? 100;
    let rows: any[];

    if (opts.key) {
      rows = this.stmts.queryDomainKey.all(opts.domain, opts.key, limit);
    } else {
      rows = this.stmts.queryDomain.all(opts.domain, limit);
    }

    // Apply time-range filters in memory (simpler than dynamic SQL)
    if (opts.since) {
      rows = rows.filter((r: any) => r.timestamp >= opts.since!);
    }
    if (opts.until) {
      rows = rows.filter((r: any) => r.timestamp <= opts.until!);
    }

    return rows.map(MetricsDAO.fromMetricRow);
  }

  getLatest(domain: string, key: string): MetricRecord | null {
    const row = this.stmts.getLatest.get(domain, key);
    return row ? MetricsDAO.fromMetricRow(row as any) : null;
  }

  /** Delete metrics older than the given ISO timestamp. */
  prune(olderThan: string): number {
    const info = this.stmts.prune.run(olderThan);
    return info.changes;
  }

  // ---- Routing Outcomes ----------------------------------------------------

  recordRouting(outcome: Omit<RoutingOutcome, 'id' | 'timestamp'>): void {
    this.stmts.recordRouting.run({
      task: outcome.task,
      model: outcome.model,
      tier: outcome.tier ?? null,
      latencyMs: outcome.latencyMs ?? null,
      success: outcome.success ? 1 : 0,
      timestamp: new Date().toISOString(),
    });
  }

  listRouting(limit = 50): RoutingOutcome[] {
    const rows = this.stmts.listRouting.all(limit);
    return (rows as any[]).map(MetricsDAO.fromRoutingRow);
  }

  pruneRouting(olderThan: string): number {
    const info = this.stmts.pruneRouting.run(olderThan);
    return info.changes;
  }

  // ---- Row mapping ---------------------------------------------------------

  private static fromMetricRow(row: any): MetricRecord {
    return {
      id: row.id,
      domain: row.domain,
      key: row.key,
      value: MetricsDAO.parseJSON(row.value, row.value),
      timestamp: row.timestamp,
    };
  }

  private static fromRoutingRow(row: any): RoutingOutcome {
    return {
      id: row.id,
      task: row.task,
      model: row.model,
      tier: row.tier,
      latencyMs: row.latency_ms,
      success: !!row.success,
      timestamp: row.timestamp,
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
