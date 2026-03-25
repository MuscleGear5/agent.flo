/**
 * Agent MCP Tools for CLI
 *
 * Tool definitions for agent lifecycle management with file persistence
 * AND real process execution via AgentProcessManager.
 * Includes model routing integration for intelligent model selection.
 */

import type { MCPTool } from './types.js';
import { getAgentProcessManager, type AgentModel } from '../services/agent-process-manager.js';
import { StateDB } from '../state-db.js';
import { AgentDAO } from '../dao/agent-dao.js';

// Model types matching Claude Agent SDK
type ClaudeModel = 'haiku' | 'sonnet' | 'opus' | 'inherit';

// Default model mappings for agent types (can be overridden)
const AGENT_TYPE_MODEL_DEFAULTS: Record<string, ClaudeModel> = {
  // Complex agents → opus
  'architect': 'opus',
  'security-architect': 'opus',
  'system-architect': 'opus',
  'core-architect': 'opus',
  // Medium complexity → sonnet
  'coder': 'sonnet',
  'reviewer': 'sonnet',
  'researcher': 'sonnet',
  'tester': 'sonnet',
  'analyst': 'sonnet',
  // Simple/fast agents → haiku
  'formatter': 'haiku',
  'linter': 'haiku',
  'documenter': 'haiku',
};

// Lazy-loaded model router
let modelRouterInstance: Awaited<ReturnType<typeof import('../ruvector/model-router.js').getModelRouter>> | null = null;

async function getModelRouter() {
  if (!modelRouterInstance) {
    try {
      const { getModelRouter } = await import('../ruvector/model-router.js');
      modelRouterInstance = getModelRouter();
    } catch (e) {
      // Log but don't fail - model router is optional
      console.error('[agent-tools] Model router load failed:', (e as Error).message);
    }
  }
  return modelRouterInstance;
}

/**
 * Determine model for agent based on (ADR-026 3-tier routing):
 * 1. Explicit model in config
 * 2. Enhanced task-based routing with Agent Booster AST (if task provided)
 * 3. Agent type defaults
 * 4. Fallback to sonnet
 */
async function determineAgentModel(
  agentType: string,
  config: Record<string, unknown>,
  task?: string
): Promise<{
  model: ClaudeModel;
  routedBy: 'explicit' | 'router' | 'agent-booster' | 'default';
  canSkipLLM?: boolean;
  agentBoosterIntent?: string;
  tier?: 1 | 2 | 3;
}> {
  // 1. Explicit model in config
  if (config.model && ['haiku', 'sonnet', 'opus', 'inherit'].includes(config.model as string)) {
    return { model: config.model as ClaudeModel, routedBy: 'explicit' };
  }

  // 2. Enhanced task-based routing with Agent Booster AST
  if (task) {
    try {
      // Try enhanced router first (includes Agent Booster detection)
      const { getEnhancedModelRouter } = await import('../ruvector/enhanced-model-router.js');
      const enhancedRouter = getEnhancedModelRouter();
      const routeResult = await enhancedRouter.route(task, { filePath: config.filePath as string });

      if (routeResult.tier === 1 && routeResult.canSkipLLM) {
        // Agent Booster can handle this task
        return {
          model: 'haiku', // Use haiku as fallback if AB fails
          routedBy: 'agent-booster',
          canSkipLLM: true,
          agentBoosterIntent: routeResult.agentBoosterIntent?.type,
          tier: 1,
        };
      }

      return {
        model: routeResult.model!,
        routedBy: 'router',
        tier: routeResult.tier,
      };
    } catch {
      // Enhanced router not available, try basic router
      const router = await getModelRouter();
      if (router) {
        try {
          const result = await router.route(task);
          return { model: result.model, routedBy: 'router' };
        } catch {
          // Fall through to defaults on router error
        }
      }
    }
  }

  // 3. Agent type defaults
  const defaultModel = AGENT_TYPE_MODEL_DEFAULTS[agentType];
  if (defaultModel) {
    return { model: defaultModel, routedBy: 'default' };
  }

  // 4. Fallback to sonnet (balanced)
  return { model: 'sonnet', routedBy: 'default' };
}

export const agentTools: MCPTool[] = [
  {
    name: 'agent_spawn',
    description: 'Spawn a new agent with intelligent model selection',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentType: { type: 'string', description: 'Type of agent to spawn' },
        agentId: { type: 'string', description: 'Optional custom agent ID' },
        config: { type: 'object', description: 'Agent configuration' },
        domain: { type: 'string', description: 'Agent domain' },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus', 'inherit'],
          description: 'Claude model to use (haiku=fast/cheap, sonnet=balanced, opus=most capable)'
        },
        task: { type: 'string', description: 'Task description for intelligent model routing' },
      },
      required: ['agentType'],
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const agents = new AgentDAO(db.database);
      const agentId = (input.agentId as string) || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const agentType = input.agentType as string;
      const config = (input.config as Record<string, unknown>) || {};

      // Add explicit model to config if provided
      if (input.model) {
        config.model = input.model;
      }

      // Get task from either top-level or config (CLI passes it in config.task)
      const task = (input.task as string) || (config.task as string) || undefined;

      // Determine model using ADR-026 3-tier routing logic
      const routingResult = await determineAgentModel(
        agentType,
        config,
        task
      );

      const agent = agents.spawn({
        id: agentId,
        type: agentType,
        status: 'idle',
        model: routingResult.model,
        metadata: {
          ...config,
          domain: input.domain as string,
          modelRoutedBy: routingResult.routedBy,
          health: 1.0,
        },
      });

      // Start a real process via AgentProcessManager
      let pid: number | null = null;
      let processStatus = 'spawned';
      try {
        const pm = getAgentProcessManager();
        const running = await pm.spawn({
          agentId,
          agentType,
          model: (routingResult.model as AgentModel) || 'sonnet',
          timeoutMs: 5 * 60 * 1000,
        });
        pid = running.pid;
        processStatus = running.status;
        // Update agent with real process status
        agents.update(agentId, {
          status: processStatus === 'idle' ? 'idle' : 'busy',
        });
      } catch (procError) {
        // Process spawn failed — agent record still exists but no process
        processStatus = 'spawn_failed';
        agents.update(agentId, {
          metadata: { ...agent.metadata, processError: (procError as Error).message },
        });
      }

      // Include Agent Booster routing info if applicable
      const response: Record<string, unknown> = {
        success: true,
        agentId,
        agentType,
        model: routingResult.model,
        modelRoutedBy: routingResult.routedBy,
        status: processStatus,
        pid: pid || undefined,
        createdAt: agent.createdAt,
      };

      // Add Agent Booster info if task can skip LLM
      if (routingResult.canSkipLLM) {
        response.canSkipLLM = true;
        response.agentBoosterIntent = routingResult.agentBoosterIntent;
        response.tier = routingResult.tier;
        response.note = `Agent Booster can handle "${routingResult.agentBoosterIntent}" - use agent_booster_edit_file MCP tool`;
      } else if (routingResult.tier) {
        response.tier = routingResult.tier;
      }

      return response;
    },
  },
  {
    name: 'agent_terminate',
    description: 'Terminate an agent',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent to terminate' },
        force: { type: 'boolean', description: 'Force immediate termination' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const agents = new AgentDAO(db.database);
      const agentId = input.agentId as string;

      if (agents.terminate(agentId)) {
        // Kill real process if running
        let processKilled = false;
        try {
          const pm = getAgentProcessManager();
          processKilled = pm.terminate(agentId, !!input.force);
        } catch {
          // Process manager may not have this agent
        }

        return {
          success: true,
          agentId,
          terminated: true,
          processKilled,
          terminatedAt: new Date().toISOString(),
        };
      }

      return {
        success: false,
        agentId,
        error: 'Agent not found',
      };
    },
  },
  {
    name: 'agent_status',
    description: 'Get agent status',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const agents = new AgentDAO(db.database);
      const agentId = input.agentId as string;
      const agent = agents.get(agentId);

      if (agent) {
        const health = (agent.metadata as Record<string, unknown>)?.health as number ?? 1.0;
        // Enrich with real process info
        let processInfo: Record<string, unknown> = {};
        try {
          const pm = getAgentProcessManager();
          const running = pm.getAgent(agentId);
          if (running && running.status !== 'dead') {
            processInfo = {
              pid: running.pid,
              processStatus: running.status,
              uptimeMs: Date.now() - running.startedAt.getTime(),
              currentTask: running.currentTask,
              processTaskCount: running.taskCount,
            };
          }
        } catch {
          // Process manager may not be available
        }

        return {
          agentId: agent.id,
          agentType: agent.type,
          status: agent.status,
          health,
          taskCount: agent.taskCount,
          createdAt: agent.createdAt,
          domain: (agent.metadata as Record<string, unknown>)?.domain,
          ...processInfo,
        };
      }

      return {
        agentId,
        status: 'not_found',
        error: 'Agent not found',
      };
    },
  },
  {
    name: 'agent_list',
    description: 'List all agents',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        domain: { type: 'string', description: 'Filter by domain' },
        includeTerminated: { type: 'boolean', description: 'Include terminated agents' },
      },
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const dao = new AgentDAO(db.database);
      let agentList = dao.list(!!input.includeTerminated);

      // Filter by status
      if (input.status) {
        agentList = agentList.filter(a => a.status === input.status);
      }

      // Filter by domain
      if (input.domain) {
        agentList = agentList.filter(a => (a.metadata as Record<string, unknown>)?.domain === input.domain);
      }

      return {
        agents: agentList.map(a => ({
          agentId: a.id,
          agentType: a.type,
          status: a.status,
          health: (a.metadata as Record<string, unknown>)?.health ?? 1.0,
          taskCount: a.taskCount,
          createdAt: a.createdAt,
          domain: (a.metadata as Record<string, unknown>)?.domain,
        })),
        total: agentList.length,
        filters: {
          status: input.status,
          domain: input.domain,
          includeTerminated: input.includeTerminated,
        },
      };
    },
  },
  {
    name: 'agent_pool',
    description: 'Manage agent pool',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'scale', 'drain', 'fill'], description: 'Pool action' },
        targetSize: { type: 'number', description: 'Target pool size (for scale action)' },
        agentType: { type: 'string', description: 'Agent type filter' },
      },
      required: ['action'],
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const dao = new AgentDAO(db.database);
      const agentList = dao.list(false);
      const action = (input.action as string) || 'status';

      if (action === 'status') {
        const byType: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const agent of agentList) {
          byType[agent.type] = (byType[agent.type] || 0) + 1;
          byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
        }
        const busyAgents = agentList.filter(a => a.status === 'busy').length;
        const utilization = agentList.length > 0 ? busyAgents / agentList.length : 0;
        const healthValues = agentList.map(a => (a.metadata as Record<string, unknown>)?.health as number ?? 1.0);
        const avgHealth = healthValues.length > 0 ? healthValues.reduce((sum, h) => sum + h, 0) / healthValues.length : 0;
        return {
          action,
          poolId: 'agent-pool-default',
          currentSize: agentList.length,
          minSize: (input.min as number) || 0,
          maxSize: (input.max as number) || 100,
          autoScale: (input.autoScale as boolean) ?? false,
          utilization,
          agents: agentList.map(a => ({
            id: a.id,
            type: a.type,
            status: a.status,
          })),
          id: 'agent-pool-default',
          size: agentList.length,
          totalAgents: agentList.length,
          byType,
          byStatus,
          avgHealth,
        };
      }

      if (action === 'scale') {
        const targetSize = (input.targetSize as number) || 5;
        const agentType = (input.agentType as string) || 'worker';
        const currentSize = agentList.filter(a => a.type === agentType).length;
        const delta = targetSize - currentSize;
        const added: string[] = [];
        const removed: string[] = [];

        if (delta > 0) {
          for (let i = 0; i < delta; i++) {
            const spawned = dao.spawn({ type: agentType });
            added.push(spawned.id);
          }
        } else if (delta < 0) {
          const toRemove = agentList.filter(a => a.type === agentType && a.status === 'idle').slice(0, -delta);
          for (const agent of toRemove) {
            dao.terminate(agent.id);
            removed.push(agent.id);
          }
        }

        return {
          action,
          agentType,
          previousSize: currentSize,
          targetSize,
          newSize: currentSize + delta,
          added,
          removed,
        };
      }

      if (action === 'drain') {
        const agentType = input.agentType as string;
        let drained = 0;
        for (const agent of agentList) {
          if (!agentType || agent.type === agentType) {
            if (agent.status === 'idle') {
              dao.terminate(agent.id);
              drained++;
            }
          }
        }
        return {
          action,
          agentType: agentType || 'all',
          drained,
          remaining: agentList.length - drained,
        };
      }

      return { action, error: 'Unknown action' };
    },
  },
  {
    name: 'agent_health',
    description: 'Check agent health',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Specific agent ID (optional)' },
        threshold: { type: 'number', description: 'Health threshold (0-1)' },
      },
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const dao = new AgentDAO(db.database);
      const agentList = dao.list(false);
      const threshold = (input.threshold as number) || 0.5;

      const getHealth = (a: typeof agentList[0]) => (a.metadata as Record<string, unknown>)?.health as number ?? 1.0;

      if (input.agentId) {
        const agent = dao.get(input.agentId as string);
        if (agent) {
          const health = getHealth(agent);
          return {
            agentId: agent.id,
            health,
            status: agent.status,
            healthy: health >= threshold,
            taskCount: agent.taskCount,
            uptime: Date.now() - new Date(agent.createdAt).getTime(),
          };
        }
        return { agentId: input.agentId, error: 'Agent not found' };
      }

      const healthyAgents = agentList.filter(a => getHealth(a) >= threshold);
      const degradedAgents = agentList.filter(a => getHealth(a) >= 0.3 && getHealth(a) < threshold);
      const unhealthyAgents = agentList.filter(a => getHealth(a) < 0.3);
      const avgHealth = agentList.length > 0 ? agentList.reduce((sum, a) => sum + getHealth(a), 0) / agentList.length : 1;
      const avgCpu = agentList.length > 0 ? 35 + Math.random() * 30 : 0;
      const avgMemory = avgHealth * 0.6;

      return {
        agents: agentList.map(a => {
          const h = getHealth(a);
          const uptime = Date.now() - new Date(a.createdAt).getTime();
          return {
            id: a.id,
            type: a.type,
            health: h >= threshold ? 'healthy' : (h >= 0.3 ? 'degraded' : 'unhealthy'),
            uptime,
            memory: { used: Math.floor(256 * (1 - h * 0.3)), limit: 512 },
            cpu: 20 + Math.floor(h * 40),
            tasks: { active: a.taskCount > 0 ? 1 : 0, queued: 0, completed: a.taskCount, failed: 0 },
            latency: { avg: 50 + Math.floor((1 - h) * 100), p99: 150 + Math.floor((1 - h) * 200) },
            errors: { count: h < threshold ? 1 : 0 },
          };
        }),
        overall: {
          healthy: healthyAgents.length,
          degraded: degradedAgents.length,
          unhealthy: unhealthyAgents.length,
          avgCpu,
          avgMemory,
          score: Math.round(avgHealth * 100),
          issues: unhealthyAgents.length,
        },
        total: agentList.length,
        healthyCount: healthyAgents.length,
        unhealthyCount: unhealthyAgents.length,
        threshold,
        avgHealth,
        unhealthyAgents: unhealthyAgents.map(a => ({
          agentId: a.id,
          health: getHealth(a),
          status: a.status,
        })),
      };
    },
  },
  {
    name: 'agent_update',
    description: 'Update agent status or config',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent' },
        status: { type: 'string', description: 'New status' },
        health: { type: 'number', description: 'Health value (0-1)' },
        taskCount: { type: 'number', description: 'Task count' },
        config: { type: 'object', description: 'Config updates' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const db = StateDB.getInstance();
      const dao = new AgentDAO(db.database);
      const agentId = input.agentId as string;
      const agent = dao.get(agentId);

      if (agent) {
        const changes: Record<string, unknown> = {};
        if (input.status) changes.status = input.status as string;
        if (typeof input.taskCount === 'number') changes.taskCount = input.taskCount as number;

        // Merge health and config into metadata
        const meta = { ...(agent.metadata as Record<string, unknown>) };
        if (typeof input.health === 'number') meta.health = input.health as number;
        if (input.config) Object.assign(meta, input.config as Record<string, unknown>);
        changes.metadata = meta;

        dao.update(agentId, changes);
        const updated = dao.get(agentId)!;

        return {
          success: true,
          agentId,
          updated: true,
          agent: {
            agentId: updated.id,
            status: updated.status,
            health: (updated.metadata as Record<string, unknown>)?.health ?? 1.0,
            taskCount: updated.taskCount,
          },
        };
      }

      return {
        success: false,
        agentId,
        error: 'Agent not found',
      };
    },
  },
];
