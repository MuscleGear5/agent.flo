/**
 * DAO (Data Access Object) barrel export.
 *
 * Each DAO wraps a single SQLite table exposed by StateDB and provides
 * typed CRUD operations.  DAOs are created in Tasks #2-#5 and re-exported
 * here as they land.
 *
 * @module v3/cli/dao
 */

// -- Task #2: Agent + Task DAOs --
export { AgentDAO } from './agent-dao.js';
export type { AgentRecord, AgentInput, AgentStats } from './agent-dao.js';
export { TaskDAO } from './task-dao.js';
export type { TaskRecord, TaskInput, TaskStats } from './task-dao.js';
// -- Task #3: Session + Memory + Swarm DAOs --
export { SessionDAO } from './session-dao.js';
export type { SessionRecord, SessionInput } from './session-dao.js';
export { MemoryDAO } from './memory-dao.js';
export type { MemoryRecord, MemoryInput, MemoryStats } from './memory-dao.js';
export { SwarmDAO } from './swarm-dao.js';
export type { SwarmRecord, SwarmInitInput } from './swarm-dao.js';
// -- Task #4: HiveMind + Workflow + Coordination DAOs --
export { HiveMindDAO } from './hive-mind-dao.js';
export type { HiveMindRecord, HiveMindInput } from './hive-mind-dao.js';
export { WorkflowDAO } from './workflow-dao.js';
export type { WorkflowRecord, WorkflowInput, WorkflowUpdate } from './workflow-dao.js';
export { CoordinationDAO } from './coordination-dao.js';
export type { CoordinationRecord, CoordinationInput } from './coordination-dao.js';
// -- Task #5: Config + Metrics + GitHub + Neural DAOs --
export { ConfigDAO } from './config-dao.js';
export type { ConfigEntry } from './config-dao.js';
export { MetricsDAO } from './metrics-dao.js';
export type { MetricRecord, RoutingOutcome, MetricsQuery } from './metrics-dao.js';
export { GitHubDAO } from './github-dao.js';
export type { GitHubRecord } from './github-dao.js';
export { NeuralDAO } from './neural-dao.js';
export type { NeuralRecord } from './neural-dao.js';
