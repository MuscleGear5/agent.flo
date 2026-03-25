/**
 * StateDB — Unified SQLite state store for all operational data.
 *
 * Replaces 20+ fragmented JSON stores with a single `.ruflo/state.db`.
 * Provides ACID transactions, WAL-mode concurrency, and cross-domain
 * atomic operations that were impossible with separate JSON files.
 *
 * @module v3/cli/state-db
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

// ---------------------------------------------------------------------------
// Type-only import so the module still loads when better-sqlite3 is missing.
// The actual `require` happens lazily inside the constructor.
// ---------------------------------------------------------------------------
type BetterSqlite3Database = import('better-sqlite3').Database;

/**
 * Result returned by the JSON migration helper.
 */
export interface MigrationResult {
  migrated: number;
  errors: string[];
}

/**
 * Options for creating / opening the StateDB.
 */
export interface StateDBOptions {
  /** Absolute path to the database file. Defaults to `<cwd>/.ruflo/state.db`. */
  dbPath?: string;
  /** Run in-memory (useful for tests). Overrides `dbPath`. */
  inMemory?: boolean;
}

// Schema version — bump when adding / altering tables.
const SCHEMA_VERSION = 1;

/**
 * Singleton that owns the single SQLite connection used by every MCP tool,
 * CLI command, and DAO in the system.
 */
export class StateDB {
  // ---- Singleton plumbing ---------------------------------------------------
  private static instance: StateDB | null = null;

  /**
   * Return the process-wide singleton, creating it on first call.
   * The database lives at `<cwd>/.ruflo/state.db` by default.
   */
  static getInstance(options?: StateDBOptions): StateDB {
    if (!StateDB.instance) {
      StateDB.instance = new StateDB(options);
    }
    return StateDB.instance;
  }

  /**
   * Tear down the singleton so the next `getInstance()` creates a fresh one.
   * Intended for test isolation — production code should not call this.
   */
  static resetInstance(): void {
    if (StateDB.instance) {
      try {
        StateDB.instance.close();
      } catch {
        // already closed — ignore
      }
      StateDB.instance = null;
    }
  }

  /**
   * Canonical database path for the current working directory.
   */
  static getPath(): string {
    return join(process.cwd(), '.ruflo', 'state.db');
  }

  // ---- Instance members -----------------------------------------------------
  private db: BetterSqlite3Database;

  private constructor(options?: StateDBOptions) {
    const inMemory = options?.inMemory ?? false;
    const dbPath = inMemory ? ':memory:' : (options?.dbPath ?? StateDB.getPath());

    // Ensure the parent directory exists (no-op for :memory:).
    if (!inMemory) {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Dynamic import — keeps the module loadable even if better-sqlite3 is
    // not yet installed (e.g. during type-checking in CI).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = StateDB.loadDriver();
    this.db = new Database(dbPath);

    this.configurePragmas();
    this.createSchema();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Raw database handle — consumed by DAO classes. */
  get database(): BetterSqlite3Database {
    return this.db;
  }

  /** Close the underlying connection and clear the singleton. */
  close(): void {
    this.db.close();
    StateDB.instance = null;
  }

  /**
   * Migrate data from the legacy `.claude-flow/` JSON stores into the
   * SQLite database.  Reads only — never deletes the original JSON files.
   */
  migrateFromJSON(basePath?: string): MigrationResult {
    const base = basePath ?? join(process.cwd(), '.claude-flow');
    const result: MigrationResult = { migrated: 0, errors: [] };

    if (!existsSync(base)) {
      return result;
    }

    const migrate = this.db.transaction(() => {
      // 1. agents/store.json → agents table
      this.migrateAgents(base, result);

      // 2. tasks/store.json → tasks table
      this.migrateTasks(base, result);

      // 3. sessions/*.json → sessions table
      this.migrateSessions(base, result);

      // 4. memory/store.json → memory table
      this.migrateMemory(base, result);

      // 5. swarm/swarm-state.json → swarm table
      this.migrateSwarm(base, result);

      // 6. hive-mind/state.json → hive_mind table
      this.migrateHiveMind(base, result);

      // 7. workflows/store.json → workflows table
      this.migrateWorkflows(base, result);

      // 8. coordination/store.json → coordination table
      this.migrateCoordination(base, result);

      // 9. config.json → config table
      this.migrateConfig(base, result);

      // 10. github/store.json → github table
      this.migrateGitHub(base, result);

      // 11-12. neural/models.json + patterns.json → neural table
      this.migrateNeural(base, result);

      // 13. routing-outcomes.json → routing_outcomes table
      this.migrateRoutingOutcomes(base, result);

      // 14-15. performance/metrics.json + system/metrics.json → metrics table
      this.migrateMetrics(base, result);

      // 16. claims/claims.json → claims table
      this.migrateClaims(base, result);
    });

    try {
      migrate();
    } catch (err: unknown) {
      result.errors.push(`Transaction failed: ${(err as Error).message}`);
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Private — driver loading
  // --------------------------------------------------------------------------

  private static loadDriver(): new (path: string) => BetterSqlite3Database {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('better-sqlite3');
    } catch {
      throw new Error(
        'better-sqlite3 is required for StateDB. Install it with: npm install better-sqlite3'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Private — pragmas
  // --------------------------------------------------------------------------

  private configurePragmas(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('foreign_keys = ON');
  }

  // --------------------------------------------------------------------------
  // Private — schema creation
  // --------------------------------------------------------------------------

  private createSchema(): void {
    this.db.exec(`
      -- =================================================================
      -- Core operational tables
      -- =================================================================

      CREATE TABLE IF NOT EXISTS agents (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        name        TEXT,
        status      TEXT NOT NULL DEFAULT 'idle',
        capabilities TEXT,           -- JSON array
        current_task TEXT,
        parent_id   TEXT,
        provider    TEXT,
        model       TEXT,
        task_count      INTEGER DEFAULT 0,
        completed_tasks INTEGER DEFAULT 0,
        metadata    TEXT,            -- JSON
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id              TEXT PRIMARY KEY,
        type            TEXT NOT NULL DEFAULT 'general',
        description     TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        priority        TEXT NOT NULL DEFAULT 'normal',
        assigned_agent  TEXT REFERENCES agents(id),
        parent_task     TEXT,
        dependencies    TEXT,        -- JSON array of task IDs
        input           TEXT,        -- JSON
        output          TEXT,        -- JSON
        error           TEXT,
        retry_count     INTEGER DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        started_at      TEXT,
        completed_at    TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        name        TEXT,
        status      TEXT NOT NULL DEFAULT 'active',
        metadata    TEXT,            -- JSON snapshot of agents/tasks/memory
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        restored_at TEXT
      );

      CREATE TABLE IF NOT EXISTS memory (
        id           TEXT PRIMARY KEY,
        key          TEXT NOT NULL,
        value        TEXT NOT NULL,
        namespace    TEXT DEFAULT 'default',
        type         TEXT DEFAULT 'semantic',
        tags         TEXT,           -- JSON array
        owner_id     TEXT,
        access_level TEXT DEFAULT 'private',
        ttl          INTEGER,        -- seconds, NULL = no expiry
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        expires_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_key       ON memory(key);
      CREATE INDEX IF NOT EXISTS idx_memory_namespace  ON memory(namespace);

      CREATE TABLE IF NOT EXISTS swarm (
        id          TEXT PRIMARY KEY DEFAULT 'default',
        topology    TEXT NOT NULL DEFAULT 'hierarchical',
        status      TEXT NOT NULL DEFAULT 'stopped',
        max_agents  INTEGER DEFAULT 10,
        strategy    TEXT DEFAULT 'specialized',
        nodes       TEXT,            -- JSON: Record<string, NodeInfo>
        connections TEXT,            -- JSON array
        metadata    TEXT,            -- JSON
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hive_mind (
        id              TEXT PRIMARY KEY DEFAULT 'default',
        queen_id        TEXT,
        status          TEXT NOT NULL DEFAULT 'inactive',
        workers         TEXT,        -- JSON array of agent IDs
        consensus_state TEXT,        -- JSON
        proposals       TEXT,        -- JSON array
        broadcast_log   TEXT,        -- JSON array
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id           TEXT PRIMARY KEY,
        name         TEXT,
        status       TEXT NOT NULL DEFAULT 'pending',
        steps        TEXT NOT NULL,  -- JSON array of step definitions
        current_step INTEGER DEFAULT 0,
        context      TEXT,           -- JSON
        results      TEXT,           -- JSON
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS coordination (
        id            TEXT PRIMARY KEY DEFAULT 'default',
        topology_type TEXT DEFAULT 'hierarchical',
        max_nodes     INTEGER DEFAULT 10,
        load_balance  TEXT,          -- JSON
        sync_state    TEXT,          -- JSON
        nodes         TEXT,          -- JSON
        consensus     TEXT,          -- JSON
        version       TEXT,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,    -- JSON
        scope      TEXT DEFAULT 'global',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        domain    TEXT NOT NULL,     -- 'system', 'performance', 'neural', 'progress', …
        key       TEXT NOT NULL,
        value     TEXT NOT NULL,     -- JSON
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_metrics_domain ON metrics(domain);
      CREATE INDEX IF NOT EXISTS idx_metrics_key    ON metrics(domain, key);

      CREATE TABLE IF NOT EXISTS routing_outcomes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task       TEXT NOT NULL,
        model      TEXT NOT NULL,
        tier       INTEGER,
        latency_ms REAL,
        success    INTEGER,
        timestamp  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,    -- 'repo', 'pr', 'issue'
        data       TEXT NOT NULL,    -- JSON
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS neural (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,    -- 'model', 'pattern'
        data       TEXT NOT NULL,    -- JSON
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS claims (
        id         TEXT PRIMARY KEY,
        data       TEXT NOT NULL,    -- JSON
        updated_at TEXT NOT NULL
      );

      -- =================================================================
      -- Metadata
      -- =================================================================

      CREATE TABLE IF NOT EXISTS _meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO _meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}');
      INSERT OR IGNORE INTO _meta (key, value) VALUES ('created_at', datetime('now'));
    `);
  }

  // --------------------------------------------------------------------------
  // Private — JSON migration helpers
  // --------------------------------------------------------------------------

  /** Safely read + parse a JSON file. Returns `null` on any failure. */
  private readJSON(filePath: string): unknown {
    try {
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  // -- Individual store migrations -------------------------------------------

  private migrateAgents(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'agents', 'store.json')) as Record<string, unknown> | null;
    if (!data) return;

    const agents = Array.isArray(data) ? data : (data as any).agents ?? Object.values(data);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO agents (id, type, name, status, capabilities, current_task,
        parent_id, provider, model, task_count, completed_tasks, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const a of agents as any[]) {
      try {
        stmt.run(
          a.id, a.type ?? 'general', a.name ?? null, a.status ?? 'idle',
          JSON.stringify(a.capabilities ?? []), a.currentTask ?? a.current_task ?? null,
          a.parentId ?? a.parent_id ?? null, a.provider ?? null, a.model ?? null,
          a.taskCount ?? a.task_count ?? 0, a.completedTasks ?? a.completed_tasks ?? 0,
          JSON.stringify(a.metadata ?? {}),
          a.createdAt ?? a.created_at ?? this.now(),
          a.updatedAt ?? a.updated_at ?? this.now(),
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`agent ${a.id}: ${(err as Error).message}`);
      }
    }
  }

  private migrateTasks(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'tasks', 'store.json')) as Record<string, unknown> | null;
    if (!data) return;

    const tasks = Array.isArray(data) ? data : (data as any).tasks ?? Object.values(data);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO tasks (id, type, description, status, priority, assigned_agent,
        parent_task, dependencies, input, output, error, retry_count,
        created_at, updated_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tasks as any[]) {
      try {
        stmt.run(
          t.id, t.type ?? 'general', t.description ?? null, t.status ?? 'pending',
          t.priority ?? 'normal', t.assignedAgent ?? t.assigned_agent ?? null,
          t.parentTask ?? t.parent_task ?? null,
          JSON.stringify(t.dependencies ?? []),
          JSON.stringify(t.input ?? null),
          JSON.stringify(t.output ?? null),
          t.error ?? null, t.retryCount ?? t.retry_count ?? 0,
          t.createdAt ?? t.created_at ?? this.now(),
          t.updatedAt ?? t.updated_at ?? this.now(),
          t.startedAt ?? t.started_at ?? null,
          t.completedAt ?? t.completed_at ?? null,
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`task ${t.id}: ${(err as Error).message}`);
      }
    }
  }

  private migrateSessions(base: string, result: MigrationResult): void {
    const dir = join(base, 'sessions');
    if (!existsSync(dir)) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, name, status, metadata, created_at, updated_at, restored_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      return;
    }

    for (const file of files) {
      const s = this.readJSON(join(dir, file)) as any;
      if (!s) continue;
      try {
        const id = s.id ?? file.replace('.json', '');
        stmt.run(
          id, s.name ?? null, s.status ?? 'saved',
          JSON.stringify(s.metadata ?? s),
          s.createdAt ?? s.created_at ?? this.now(),
          s.updatedAt ?? s.updated_at ?? this.now(),
          s.restoredAt ?? s.restored_at ?? null,
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`session ${file}: ${(err as Error).message}`);
      }
    }
  }

  private migrateMemory(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'memory', 'store.json')) as Record<string, unknown> | null;
    if (!data) return;

    const entries = Array.isArray(data) ? data : (data as any).entries ?? Object.values(data);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO memory (id, key, value, namespace, type, tags, owner_id,
        access_level, ttl, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of entries as any[]) {
      try {
        stmt.run(
          m.id ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          m.key ?? '', m.value ?? m.content ?? '',
          m.namespace ?? 'default', m.type ?? 'semantic',
          JSON.stringify(m.tags ?? []),
          m.ownerId ?? m.owner_id ?? null,
          m.accessLevel ?? m.access_level ?? 'private',
          m.ttl ?? null,
          m.createdAt ?? m.created_at ?? this.now(),
          m.updatedAt ?? m.updated_at ?? this.now(),
          m.expiresAt ?? m.expires_at ?? null,
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`memory ${m.key ?? m.id}: ${(err as Error).message}`);
      }
    }
  }

  private migrateSwarm(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'swarm', 'swarm-state.json')) as any;
    if (!data) return;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO swarm (id, topology, status, max_agents, strategy,
          nodes, connections, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id ?? 'default', data.topology ?? 'hierarchical',
        data.status ?? 'stopped', data.maxAgents ?? data.max_agents ?? 10,
        data.strategy ?? 'specialized',
        JSON.stringify(data.nodes ?? {}),
        JSON.stringify(data.connections ?? []),
        JSON.stringify(data.metadata ?? {}),
        data.createdAt ?? data.created_at ?? this.now(),
        data.updatedAt ?? data.updated_at ?? this.now(),
      );
      result.migrated++;
    } catch (err: unknown) {
      result.errors.push(`swarm: ${(err as Error).message}`);
    }
  }

  private migrateHiveMind(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'hive-mind', 'state.json')) as any;
    if (!data) return;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO hive_mind (id, queen_id, status, workers,
          consensus_state, proposals, broadcast_log, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id ?? 'default', data.queenId ?? data.queen_id ?? null,
        data.status ?? 'inactive',
        JSON.stringify(data.workers ?? []),
        JSON.stringify(data.consensusState ?? data.consensus_state ?? {}),
        JSON.stringify(data.proposals ?? []),
        JSON.stringify(data.broadcastLog ?? data.broadcast_log ?? []),
        data.createdAt ?? data.created_at ?? this.now(),
        data.updatedAt ?? data.updated_at ?? this.now(),
      );
      result.migrated++;
    } catch (err: unknown) {
      result.errors.push(`hive_mind: ${(err as Error).message}`);
    }
  }

  private migrateWorkflows(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'workflows', 'store.json')) as Record<string, unknown> | null;
    if (!data) return;

    const workflows = Array.isArray(data) ? data : (data as any).workflows ?? Object.values(data);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO workflows (id, name, status, steps, current_step,
        context, results, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const w of workflows as any[]) {
      try {
        stmt.run(
          w.id, w.name ?? null, w.status ?? 'pending',
          JSON.stringify(w.steps ?? []), w.currentStep ?? w.current_step ?? 0,
          JSON.stringify(w.context ?? {}), JSON.stringify(w.results ?? {}),
          w.createdAt ?? w.created_at ?? this.now(),
          w.updatedAt ?? w.updated_at ?? this.now(),
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`workflow ${w.id}: ${(err as Error).message}`);
      }
    }
  }

  private migrateCoordination(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'coordination', 'store.json')) as any;
    if (!data) return;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO coordination (id, topology_type, max_nodes,
          load_balance, sync_state, nodes, consensus, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id ?? 'default', data.topologyType ?? data.topology_type ?? 'hierarchical',
        data.maxNodes ?? data.max_nodes ?? 10,
        JSON.stringify(data.loadBalance ?? data.load_balance ?? {}),
        JSON.stringify(data.syncState ?? data.sync_state ?? {}),
        JSON.stringify(data.nodes ?? {}),
        JSON.stringify(data.consensus ?? {}),
        data.version ?? null,
        data.updatedAt ?? data.updated_at ?? this.now(),
      );
      result.migrated++;
    } catch (err: unknown) {
      result.errors.push(`coordination: ${(err as Error).message}`);
    }
  }

  private migrateConfig(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'config.json')) as Record<string, unknown> | null;
    if (!data) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO config (key, value, scope, updated_at)
      VALUES (?, ?, 'global', ?)
    `);

    for (const [key, value] of Object.entries(data)) {
      try {
        stmt.run(key, JSON.stringify(value), this.now());
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`config ${key}: ${(err as Error).message}`);
      }
    }
  }

  private migrateGitHub(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'github', 'store.json')) as Record<string, unknown> | null;
    if (!data) return;

    const items = Array.isArray(data) ? data : Object.values(data);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO github (id, type, data, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const g of items as any[]) {
      try {
        stmt.run(
          g.id, g.type ?? 'unknown', JSON.stringify(g),
          g.updatedAt ?? g.updated_at ?? this.now(),
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`github ${g.id}: ${(err as Error).message}`);
      }
    }
  }

  private migrateNeural(base: string, result: MigrationResult): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO neural (id, type, data, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    // models.json
    const models = this.readJSON(join(base, 'neural', 'models.json'));
    if (models && typeof models === 'object') {
      for (const [key, value] of Object.entries(models as Record<string, unknown>)) {
        try {
          stmt.run(`model-${key}`, 'model', JSON.stringify(value), this.now());
          result.migrated++;
        } catch (err: unknown) {
          result.errors.push(`neural model ${key}: ${(err as Error).message}`);
        }
      }
    }

    // patterns.json
    const patterns = this.readJSON(join(base, 'neural', 'patterns.json'));
    if (patterns && typeof patterns === 'object') {
      const items = Array.isArray(patterns) ? patterns : Object.entries(patterns as Record<string, unknown>);
      for (const item of items) {
        try {
          if (Array.isArray(item)) {
            // entries from Object.entries
            stmt.run(`pattern-${item[0]}`, 'pattern', JSON.stringify(item[1]), this.now());
          } else {
            stmt.run((item as any).id ?? `pattern-${Date.now()}`, 'pattern', JSON.stringify(item), this.now());
          }
          result.migrated++;
        } catch (err: unknown) {
          result.errors.push(`neural pattern: ${(err as Error).message}`);
        }
      }
    }
  }

  private migrateRoutingOutcomes(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'routing-outcomes.json'));
    if (!data || !Array.isArray(data)) return;

    const stmt = this.db.prepare(`
      INSERT INTO routing_outcomes (task, model, tier, latency_ms, success, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const r of data as any[]) {
      try {
        stmt.run(
          r.task ?? '', r.model ?? '', r.tier ?? null,
          r.latencyMs ?? r.latency_ms ?? null,
          r.success != null ? (r.success ? 1 : 0) : null,
          r.timestamp ?? this.now(),
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`routing_outcome: ${(err as Error).message}`);
      }
    }
  }

  private migrateMetrics(base: string, result: MigrationResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (domain, key, value, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    const sources: Array<{ file: string; domain: string }> = [
      { file: join(base, 'performance', 'metrics.json'), domain: 'performance' },
      { file: join(base, 'system', 'metrics.json'), domain: 'system' },
      { file: join(base, 'metrics', 'v3-progress.json'), domain: 'progress' },
    ];

    for (const { file, domain } of sources) {
      const data = this.readJSON(file);
      if (!data || typeof data !== 'object') continue;

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        try {
          stmt.run(domain, key, JSON.stringify(value), this.now());
          result.migrated++;
        } catch (err: unknown) {
          result.errors.push(`metrics ${domain}/${key}: ${(err as Error).message}`);
        }
      }
    }
  }

  private migrateClaims(base: string, result: MigrationResult): void {
    const data = this.readJSON(join(base, 'claims', 'claims.json'));
    if (!data) return;

    const items = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO claims (id, data, updated_at)
      VALUES (?, ?, ?)
    `);

    for (const c of items as any[]) {
      try {
        stmt.run(
          c.id ?? `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          JSON.stringify(c),
          c.updatedAt ?? c.updated_at ?? this.now(),
        );
        result.migrated++;
      } catch (err: unknown) {
        result.errors.push(`claim: ${(err as Error).message}`);
      }
    }
  }
}

export default StateDB;
