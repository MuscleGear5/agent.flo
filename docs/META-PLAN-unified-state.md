# META-PLAN: Unified State Store Migration

## Status: DRAFT
## Date: 2026-03-25
## Scope: Replace 17+ fragmented JSON stores with single `.ruflo/state.db` (SQLite)

---

## 1. CURRENT STATE: The Fragmentation Problem

### 17 Separate JSON Store Files

Every MCP tool file independently implements `loadXxxStore()` / `saveXxxStore()` with hardcoded paths:

| # | Store | Path | Tool File | Load Func | Save Func |
|---|-------|------|-----------|-----------|-----------|
| 1 | Agents | `.claude-flow/agents/store.json` | agent-tools.ts | `loadAgentStore()` | `saveAgentStore()` |
| 2 | Tasks | `.claude-flow/tasks/store.json` | task-tools.ts | `loadTaskStore()` | `saveTaskStore()` |
| 3 | Sessions | `.claude-flow/sessions/{id}.json` | session-tools.ts | `loadSession()` | `saveSession()` |
| 4 | Memory | `.claude-flow/memory/store.json` | memory-tools.ts | `loadLegacyStore()` | (migration marker) |
| 5 | Swarm | `.claude-flow/swarm/swarm-state.json` | swarm-tools.ts | `loadSwarmStore()` | `saveSwarmStore()` |
| 6 | Hive-Mind | `.claude-flow/hive-mind/state.json` | hive-mind-tools.ts | `loadHiveState()` | `saveHiveState()` |
| 7 | Workflow | `.claude-flow/workflows/store.json` | workflow-tools.ts | `loadWorkflowStore()` | `saveWorkflowStore()` |
| 8 | Coordination | `.claude-flow/coordination/store.json` | coordination-tools.ts | `loadCoordStore()` | `saveCoordStore()` |
| 9 | Config | `.claude-flow/config.json` | config-tools.ts | `loadConfigStore()` | `saveConfigStore()` |
| 10 | GitHub | `.claude-flow/github/store.json` | github-tools.ts | `loadGitHubStore()` | `saveGitHubStore()` |
| 11 | Neural Models | `.claude-flow/neural/models.json` | neural-tools.ts | `loadPatternStore()` | `writeFileSync()` |
| 12 | Neural Patterns | `.claude-flow/neural/patterns.json` | neural-tools.ts | `loadPatternStore()` | `writeFileSync()` |
| 13 | Hooks/Routing | `.claude-flow/routing-outcomes.json` | hooks-tools.ts | `readFileSync()` | `writeFileSync()` |
| 14 | Performance | `.claude-flow/performance/metrics.json` | performance-tools.ts | `loadPerfStore()` | `savePerfStore()` |
| 15 | System Metrics | `.claude-flow/system/metrics.json` | system-tools.ts | `loadMetrics()` | `saveMetrics()` |
| 16 | Claims | `.claude-flow/claims/claims.json` | claims-tools.ts | `readFileSync()` | `writeFileSync()` |
| 17 | DAA | `.claude-flow/daa/store.json` | daa-tools.ts | `readFileSync()` | `writeFileSync()` |
| 18 | Embeddings | `.claude-flow/embeddings/embeddings.json` | embeddings-tools.ts | `readFileSync()` | `writeFileSync()` |
| 19 | Terminal | `.claude-flow/terminal/store.json` | terminal-tools.ts | `readFileSync()` | `writeFileSync()` |
| 20 | Progress | `.claude-flow/metrics/v3-progress.json` | progress-tools.ts | `readFileSync()` | `writeFileSync()` |

### Known Path Mismatches (Bugs)

| Location | Path Used | Should Be |
|----------|-----------|-----------|
| `hive-mind-tools.ts:199` | `.claude-flow/agents.json` | `.claude-flow/agents/store.json` |
| `task-tools.ts:386` (task_complete) | `.claude-flow/agents.json` | `.claude-flow/agents/store.json` |
| `task-tools.ts:275` (task_assign) | `.claude-flow/agents/store.json` | (correct) |
| `session-tools.ts:110` | `.claude-flow/agents/store.json` | (correct) |

### Cross-Store Dependencies (Race Conditions)

```
task_complete() → reads tasks → updates task → reads agents → updates agent
session_save() → reads memory + tasks + agents → writes session
session_restore() → reads session → writes memory + tasks + agents
hive_mind_spawn() → reads agents → updates queen/workers
```

Each CLI invocation spawns a fresh Node.js process. Two concurrent `ruflo mcp exec` calls can:
1. Both read agents.json
2. Both modify it
3. Last writer wins, first writer's changes lost

### 9 Command Files With Direct Store Access

| # | Command | Direct Access |
|---|---------|---------------|
| 1 | `agent.ts` | `.claude-flow/metrics/swarm-activity.json` |
| 2 | `session.ts` | `.claude-flow/sessions/` |
| 3 | `doctor.ts` | `.claude-flow/` (existence checks) |
| 4 | `swarm.ts` | `.claude-flow/swarm/` |
| 5 | `hooks.ts` | `.claude-flow/routing-outcomes.json` |
| 6 | `init.ts` | Creates `.claude-flow/` structure |
| 7 | `daemon.ts` | `.claude-flow/pids/`, `.claude-flow/logs/` |
| 8 | `start.ts` | `.claude-flow/config.json` |
| 9 | `providers.ts` | `.claude-flow/` config files |

### Shell Helpers With Direct File I/O

| Helper | Direct Access |
|--------|---------------|
| `v3-quick-status.sh` | `.claude-flow/metrics/v3-progress.json`, security/audit-status.json, performance.json |
| `ddd-tracker.sh` | `.claude-flow/metrics/` |
| `adr-compliance.sh` | `.claude-flow/metrics/` |
| `daemon-manager.sh` | `.claude-flow/pids/`, `.claude-flow/logs/` |
| `perf-worker.sh` | `.claude-flow/metrics/` |
| `swarm-monitor.sh` | `.claude-flow/metrics/` |
| `swarm-comms.sh` | `.claude-flow/swarm/` |
| `pattern-consolidator.sh` | `.claude-flow/learning/patterns.db` |
| `health-monitor.sh` | `.claude-flow/metrics/` |
| `security-scanner.sh` | `.claude-flow/security/` |
| `worker-manager.sh` | `.claude-flow/metrics/` |
| `guidance-hooks.sh` | `.claude-flow/last-guidance.txt` |

### RFL TUI Wrapper (Stateless)

RFL handlers are **stateless** — all state access goes through `ruflo mcp exec --tool <tool>`.
No direct file changes needed in rfl/*.zsh files. Fixing MCP tools fixes rfl automatically.

---

## 2. EXISTING INFRASTRUCTURE TO REUSE

### Production SQLite Backend (Already Built)

`v3/@claude-flow/memory/src/sqlite-backend.ts`:
- Uses `better-sqlite3` (native, fast)
- WAL mode support
- ACID transactions
- Platform detection (`database-provider.ts`)
- Fallback to `sql.js` (WASM) on Windows

### Hybrid Backend (Already Built)

`v3/@claude-flow/memory/src/hybrid-backend.ts`:
- Routes between SQLite (structured) and AgentDB (vector)
- Dual-write support
- Configurable strategy

### DDD Repository Interfaces (Already Defined)

`v3/@claude-flow/cli/src/infrastructure/in-memory-repositories.ts`:
- `InMemoryAgentRepository` implements `IAgentRepository`
- `InMemoryTaskRepository` implements `ITaskRepository`
- These interfaces can be reused for SQLite implementations

---

## 3. TARGET STATE: `.ruflo/state.db`

### Single SQLite Database

```
.ruflo/
  state.db          # All operational state
  state.db-wal      # WAL journal (auto-managed)
  state.db-shm      # Shared memory (auto-managed)
  vectors.db        # Vector embeddings (HNSW, separate for perf)
```

### Schema

```sql
-- Core operational tables
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  capabilities TEXT, -- JSON array
  current_task TEXT,
  parent_id TEXT,
  provider TEXT,
  model TEXT,
  task_count INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_agent TEXT REFERENCES agents(id),
  parent_task TEXT,
  dependencies TEXT, -- JSON array of task IDs
  input TEXT, -- JSON
  output TEXT, -- JSON
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata TEXT, -- JSON (snapshot of agents/tasks/memory at save time)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  restored_at TEXT
);

CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  namespace TEXT DEFAULT 'default',
  type TEXT DEFAULT 'semantic',
  tags TEXT, -- JSON array
  owner_id TEXT,
  access_level TEXT DEFAULT 'private',
  ttl INTEGER, -- seconds, NULL = no expiry
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX idx_memory_key ON memory(key);
CREATE INDEX idx_memory_namespace ON memory(namespace);

CREATE TABLE swarm (
  id TEXT PRIMARY KEY DEFAULT 'default',
  topology TEXT NOT NULL DEFAULT 'hierarchical',
  status TEXT NOT NULL DEFAULT 'stopped',
  max_agents INTEGER DEFAULT 10,
  strategy TEXT DEFAULT 'specialized',
  nodes TEXT, -- JSON: Record<string, NodeInfo>
  connections TEXT, -- JSON array
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE hive_mind (
  id TEXT PRIMARY KEY DEFAULT 'default',
  queen_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  workers TEXT, -- JSON array of agent IDs
  consensus_state TEXT, -- JSON
  proposals TEXT, -- JSON array
  broadcast_log TEXT, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  steps TEXT NOT NULL, -- JSON array of step definitions
  current_step INTEGER DEFAULT 0,
  context TEXT, -- JSON
  results TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE coordination (
  id TEXT PRIMARY KEY DEFAULT 'default',
  topology_type TEXT DEFAULT 'hierarchical',
  max_nodes INTEGER DEFAULT 10,
  load_balance TEXT, -- JSON
  sync_state TEXT, -- JSON
  nodes TEXT, -- JSON
  consensus TEXT, -- JSON
  version TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON
  scope TEXT DEFAULT 'global',
  updated_at TEXT NOT NULL
);

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL, -- 'system', 'performance', 'neural', 'progress', etc.
  key TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON
  timestamp TEXT NOT NULL
);
CREATE INDEX idx_metrics_domain ON metrics(domain);
CREATE INDEX idx_metrics_key ON metrics(domain, key);

CREATE TABLE routing_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  tier INTEGER,
  latency_ms REAL,
  success INTEGER,
  timestamp TEXT NOT NULL
);

CREATE TABLE github (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'repo', 'pr', 'issue'
  data TEXT NOT NULL, -- JSON
  updated_at TEXT NOT NULL
);

CREATE TABLE neural (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'model', 'pattern'
  data TEXT NOT NULL, -- JSON
  updated_at TEXT NOT NULL
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL, -- JSON
  updated_at TEXT NOT NULL
);

-- Metadata
CREATE TABLE _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO _meta (key, value) VALUES ('schema_version', '1');
INSERT INTO _meta (key, value) VALUES ('created_at', datetime('now'));
```

---

## 4. ARCHITECTURE: StateDB Module

### New File: `v3/@claude-flow/cli/src/state-db.ts`

```typescript
// Single module all tools import
import Database from 'better-sqlite3';

class StateDB {
  private static instance: StateDB | null = null;
  private db: Database.Database;

  static getInstance(): StateDB { /* singleton */ }
  static getPath(): string { return join(process.cwd(), '.ruflo', 'state.db'); }

  // Domain-specific accessors
  agents: AgentDAO;
  tasks: TaskDAO;
  sessions: SessionDAO;
  memory: MemoryDAO;
  swarm: SwarmDAO;
  hiveMind: HiveMindDAO;
  workflows: WorkflowDAO;
  coordination: CoordinationDAO;
  config: ConfigDAO;
  metrics: MetricsDAO;
  github: GitHubDAO;
  neural: NeuralDAO;

  // Cross-domain atomic operations
  completeTask(taskId: string, output: any): void {
    // Single transaction: update task + update agent atomically
  }

  saveSession(id: string): void {
    // Single transaction: snapshot agents + tasks + memory
  }

  restoreSession(id: string): void {
    // Single transaction: restore all domain state
  }
}
```

### Each DAO Pattern

```typescript
class AgentDAO {
  constructor(private db: Database.Database) {}

  list(): Agent[] { /* SELECT * FROM agents WHERE status != 'terminated' */ }
  get(id: string): Agent | null { /* SELECT * FROM agents WHERE id = ? */ }
  spawn(agent: AgentInput): Agent { /* INSERT INTO agents ... */ }
  update(id: string, changes: Partial<Agent>): void { /* UPDATE agents SET ... */ }
  terminate(id: string): void { /* UPDATE agents SET status = 'terminated' */ }
  getStats(): AgentStats { /* SELECT status, COUNT(*) ... GROUP BY status */ }
}
```

---

## 5. MIGRATION STRATEGY

### Phase 1: Create StateDB Module (Non-Breaking)
- Create `state-db.ts` with full schema
- Create all DAO classes
- Add migration logic (reads old JSON → writes to SQLite)
- Add `--migrate` flag to CLI
- **0 existing files changed**

### Phase 2: Wire MCP Tools (One File at a Time)
- Replace each tool's `loadXxxStore()`/`saveXxxStore()` with `StateDB.getInstance().xxx`
- Each file is an independent change
- Can be done incrementally — old JSON still works as fallback

### Phase 3: Wire Command Files
- Replace direct `readFileSync`/`writeFileSync` in 9 command files
- Same pattern: `StateDB.getInstance().xxx`

### Phase 4: Update Shell Helpers
- Replace `jq` reads of `.claude-flow/metrics/*.json` with `ruflo state query <domain>`
- Or add a lightweight `ruflo state export --domain metrics --format json` command

### Phase 5: Rename Directory
- `.claude-flow/` → `.ruflo/` (with symlink for backward compat)
- Update `init.ts` to create `.ruflo/`
- Update `doctor.ts` to check `.ruflo/`

### Phase 6: Cleanup
- Remove all `loadXxxStore()`/`saveXxxStore()` dead code
- Remove JSON store file creation
- Add migration path for users with existing `.claude-flow/` data

---

## 6. FILE-BY-FILE CHANGE LIST

### New Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `v3/@claude-flow/cli/src/state-db.ts` | StateDB singleton + schema + migration |
| 2 | `v3/@claude-flow/cli/src/dao/agent-dao.ts` | Agent data access |
| 3 | `v3/@claude-flow/cli/src/dao/task-dao.ts` | Task data access |
| 4 | `v3/@claude-flow/cli/src/dao/session-dao.ts` | Session data access |
| 5 | `v3/@claude-flow/cli/src/dao/memory-dao.ts` | Memory data access |
| 6 | `v3/@claude-flow/cli/src/dao/swarm-dao.ts` | Swarm data access |
| 7 | `v3/@claude-flow/cli/src/dao/hive-mind-dao.ts` | Hive-mind data access |
| 8 | `v3/@claude-flow/cli/src/dao/workflow-dao.ts` | Workflow data access |
| 9 | `v3/@claude-flow/cli/src/dao/coordination-dao.ts` | Coordination data access |
| 10 | `v3/@claude-flow/cli/src/dao/config-dao.ts` | Config data access |
| 11 | `v3/@claude-flow/cli/src/dao/metrics-dao.ts` | Metrics data access |
| 12 | `v3/@claude-flow/cli/src/dao/github-dao.ts` | GitHub data access |
| 13 | `v3/@claude-flow/cli/src/dao/neural-dao.ts` | Neural data access |
| 14 | `v3/@claude-flow/cli/src/dao/index.ts` | Re-exports all DAOs |

### MCP Tool Files to Modify (17 files)

| # | File | Changes |
|---|------|---------|
| 1 | `mcp-tools/agent-tools.ts` | Remove loadAgentStore/saveAgentStore, import StateDB, replace all store access |
| 2 | `mcp-tools/task-tools.ts` | Remove loadTaskStore/saveTaskStore, fix agents.json path bug, use StateDB |
| 3 | `mcp-tools/session-tools.ts` | Remove loadSession/saveSession, use StateDB.sessions + atomic cross-domain ops |
| 4 | `mcp-tools/memory-tools.ts` | Remove legacy JSON store, use StateDB.memory (keeps sql.js migration path) |
| 5 | `mcp-tools/swarm-tools.ts` | Remove loadSwarmStore/saveSwarmStore, use StateDB.swarm |
| 6 | `mcp-tools/hive-mind-tools.ts` | Remove loadHiveState/saveHiveState, fix agents.json bug, use StateDB.hiveMind |
| 7 | `mcp-tools/workflow-tools.ts` | Remove loadWorkflowStore/saveWorkflowStore, use StateDB.workflows |
| 8 | `mcp-tools/coordination-tools.ts` | Remove loadCoordStore/saveCoordStore, use StateDB.coordination |
| 9 | `mcp-tools/config-tools.ts` | Remove loadConfigStore/saveConfigStore, use StateDB.config |
| 10 | `mcp-tools/github-tools.ts` | Remove loadGitHubStore/saveGitHubStore, use StateDB.github |
| 11 | `mcp-tools/neural-tools.ts` | Remove JSON file access, use StateDB.neural |
| 12 | `mcp-tools/hooks-tools.ts` | Remove routing-outcomes JSON, use StateDB.metrics |
| 13 | `mcp-tools/performance-tools.ts` | Remove loadPerfStore/savePerfStore, use StateDB.metrics |
| 14 | `mcp-tools/system-tools.ts` | Remove loadMetrics/saveMetrics, use StateDB.metrics |
| 15 | `mcp-tools/progress-tools.ts` | Remove JSON file access, use StateDB.metrics |
| 16 | `mcp-tools/claims-tools.ts` | Remove JSON file access, use StateDB.claims |
| 17 | `mcp-tools/daa-tools.ts` | Remove JSON file access, use StateDB (generic table or claims) |

### Command Files to Modify (9 files)

| # | File | Changes |
|---|------|---------|
| 1 | `commands/agent.ts` | Replace swarm-activity.json write with StateDB.metrics |
| 2 | `commands/session.ts` | Replace direct session file access with StateDB.sessions |
| 3 | `commands/doctor.ts` | Update health checks to look at .ruflo/state.db |
| 4 | `commands/swarm.ts` | Replace direct swarm state access with StateDB.swarm |
| 5 | `commands/hooks.ts` | Replace routing-outcomes.json with StateDB.metrics |
| 6 | `commands/init.ts` | Create .ruflo/ + state.db instead of .claude-flow/ + JSON files |
| 7 | `commands/daemon.ts` | PIDs/logs stay as files (appropriate), update paths to .ruflo/ |
| 8 | `commands/start.ts` | Replace config.json read with StateDB.config |
| 9 | `commands/providers.ts` | Update config paths |

### Shell Helpers to Update (12 files)

| # | File | Changes |
|---|------|---------|
| 1 | `v3-quick-status.sh` | Replace jq reads with `ruflo state query metrics` or direct sqlite3 |
| 2 | `ddd-tracker.sh` | Replace metrics file writes with `ruflo state set metrics` |
| 3 | `adr-compliance.sh` | Same pattern |
| 4 | `daemon-manager.sh` | Update paths .claude-flow/ → .ruflo/ (PIDs/logs stay as files) |
| 5 | `perf-worker.sh` | Replace metrics writes |
| 6 | `swarm-monitor.sh` | Replace metrics writes |
| 7 | `swarm-comms.sh` | Replace swarm state access |
| 8 | `pattern-consolidator.sh` | Update patterns.db path |
| 9 | `health-monitor.sh` | Replace metrics writes |
| 10 | `security-scanner.sh` | Replace security state writes |
| 11 | `worker-manager.sh` | Replace metrics writes |
| 12 | `guidance-hooks.sh` | Replace last-guidance.txt with StateDB.config |

### RFL Files: NO CHANGES NEEDED

RFL handlers access state exclusively via `ruflo mcp exec --tool`. Fixing the MCP tools automatically fixes rfl.

---

## 7. DEPENDENCY GRAPH

```
Phase 1: state-db.ts + dao/*.ts (NEW, non-breaking)
    │
    ├── Phase 2a: agent-tools.ts + task-tools.ts (fixes cross-store bugs)
    │       │
    │       ├── Phase 2b: hive-mind-tools.ts (depends on agent DAO)
    │       ├── Phase 2c: session-tools.ts (depends on all DAOs)
    │       └── Phase 2d: remaining 13 MCP tools (independent of each other)
    │
    ├── Phase 3: 9 command files (can parallel with Phase 2d)
    │
    ├── Phase 4: 12 shell helpers (after Phase 2 complete)
    │
    └── Phase 5: .claude-flow/ → .ruflo/ rename + migration
```

### Parallel Execution Opportunities

- All 13 independent MCP tools (Phase 2d) can be modified in parallel
- All 9 command files (Phase 3) can be modified in parallel
- Phase 3 and Phase 2d can run concurrently
- Shell helpers (Phase 4) are independent of each other

---

## 8. RISK ASSESSMENT

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | JSON → SQLite migration reads old files, never deletes them |
| `better-sqlite3` native dependency | Already installed and working for memory package |
| Concurrent access from shell helpers | SQLite WAL mode handles concurrent readers + single writer |
| Breaking existing `.claude-flow/` users | Backward-compat: check both `.ruflo/` and `.claude-flow/`, auto-migrate |
| Large schema change | Incremental rollout — each tool file is independent |

---

## 9. METRICS

| Metric | Before | After |
|--------|--------|-------|
| Store files | 20+ JSON files | 1 SQLite DB |
| Load/save functions | 34+ (17 load + 17 save) | 1 StateDB import |
| Lines of boilerplate | ~600 (loadXxxStore/saveXxxStore) | 0 |
| Cross-store atomicity | None (race conditions) | SQLite transactions |
| Path mismatches | 2 known bugs | Impossible (single source) |
| Query capability | Read entire file, filter in JS | SQL WHERE clauses |
| Concurrent access safety | Last-writer-wins | WAL mode + transactions |

---

## 10. TOTAL CHANGE COUNT

| Category | Files | New | Modified |
|----------|-------|-----|----------|
| StateDB + DAOs | 15 | 15 | 0 |
| MCP Tools | 17 | 0 | 17 |
| Commands | 9 | 0 | 9 |
| Shell Helpers | 12 | 0 | 12 |
| RFL Handlers | 0 | 0 | 0 |
| **TOTAL** | **53** | **15** | **38** |
