/**
 * Task MCP Tools for CLI
 *
 * Tool definitions for task management with file persistence
 * AND real execution via AgentProcessManager.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MCPTool } from './types.js';
import { getAgentProcessManager } from '../services/agent-process-manager.js';

// Storage paths
const STORAGE_DIR = '.claude-flow';
const TASK_DIR = 'tasks';
const TASK_FILE = 'store.json';

interface TaskRecord {
  taskId: string;
  type: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  assignedTo: string[];
  tags: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result?: Record<string, unknown>;
}

interface TaskStore {
  tasks: Record<string, TaskRecord>;
  version: string;
}

function getTaskDir(): string {
  return join(process.cwd(), STORAGE_DIR, TASK_DIR);
}

function getTaskPath(): string {
  return join(getTaskDir(), TASK_FILE);
}

function ensureTaskDir(): void {
  const dir = getTaskDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadTaskStore(): TaskStore {
  try {
    const path = getTaskPath();
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return empty store on error
  }
  return { tasks: {}, version: '3.0.0' };
}

function saveTaskStore(store: TaskStore): void {
  ensureTaskDir();
  writeFileSync(getTaskPath(), JSON.stringify(store, null, 2), 'utf-8');
}

export const taskTools: MCPTool[] = [
  {
    name: 'task_create',
    description: 'Create a new task',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Task type (feature, bugfix, research, refactor)' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', description: 'Task priority (low, normal, high, critical)' },
        assignTo: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to assign' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Task tags' },
      },
      required: ['type', 'description'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const task: TaskRecord = {
        taskId,
        type: input.type as string,
        description: input.description as string,
        priority: (input.priority as TaskRecord['priority']) || 'normal',
        status: 'pending',
        progress: 0,
        assignedTo: (input.assignTo as string[]) || [],
        tags: (input.tags as string[]) || [],
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };

      store.tasks[taskId] = task;
      saveTaskStore(store);

      return {
        taskId,
        type: task.type,
        description: task.description,
        priority: task.priority,
        status: task.status,
        createdAt: task.createdAt,
        assignedTo: task.assignedTo,
        tags: task.tags,
      };
    },
  },
  {
    name: 'task_status',
    description: 'Get task status',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
      },
      required: ['taskId'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = input.taskId as string;
      const task = store.tasks[taskId];

      if (task) {
        return {
          taskId: task.taskId,
          type: task.type,
          description: task.description,
          status: task.status,
          progress: task.progress,
          priority: task.priority,
          assignedTo: task.assignedTo,
          tags: task.tags,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        };
      }

      return {
        taskId,
        status: 'not_found',
        error: 'Task not found',
      };
    },
  },
  {
    name: 'task_list',
    description: 'List all tasks',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        type: { type: 'string', description: 'Filter by type' },
        assignedTo: { type: 'string', description: 'Filter by assigned agent' },
        priority: { type: 'string', description: 'Filter by priority' },
        limit: { type: 'number', description: 'Max tasks to return' },
      },
    },
    handler: async (input) => {
      const store = loadTaskStore();
      let tasks = Object.values(store.tasks);

      // Apply filters
      if (input.status) {
        // Support comma-separated status values
        const statuses = (input.status as string).split(',').map(s => s.trim());
        tasks = tasks.filter(t => statuses.includes(t.status));
      }
      if (input.type) {
        tasks = tasks.filter(t => t.type === input.type);
      }
      if (input.assignedTo) {
        tasks = tasks.filter(t => t.assignedTo.includes(input.assignedTo as string));
      }
      if (input.priority) {
        tasks = tasks.filter(t => t.priority === input.priority);
      }

      // Sort by creation date (newest first)
      tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply limit
      const limit = (input.limit as number) || 50;
      tasks = tasks.slice(0, limit);

      return {
        tasks: tasks.map(t => ({
          taskId: t.taskId,
          type: t.type,
          description: t.description,
          status: t.status,
          progress: t.progress,
          priority: t.priority,
          assignedTo: t.assignedTo,
          createdAt: t.createdAt,
        })),
        total: tasks.length,
        filters: {
          status: input.status,
          type: input.type,
          assignedTo: input.assignedTo,
          priority: input.priority,
        },
      };
    },
  },
  {
    name: 'task_complete',
    description: 'Mark task as complete',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        result: { type: 'object', description: 'Task result data' },
      },
      required: ['taskId'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = input.taskId as string;
      const task = store.tasks[taskId];

      if (task) {
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.result = (input.result as Record<string, unknown>) || {};
        saveTaskStore(store);

        // Sync assigned agents back to idle and increment taskCount
        if (task.assignedTo.length > 0) {
          const agentStorePath = join(process.cwd(), STORAGE_DIR, 'agents.json');
          try {
            let agentStore: { agents: Record<string, Record<string, unknown>> } = { agents: {} };
            if (existsSync(agentStorePath)) {
              agentStore = JSON.parse(readFileSync(agentStorePath, 'utf-8'));
            }
            for (const agentId of task.assignedTo) {
              if (agentStore.agents[agentId]) {
                agentStore.agents[agentId].status = 'idle';
                agentStore.agents[agentId].currentTask = null;
                agentStore.agents[agentId].taskCount =
                  ((agentStore.agents[agentId].taskCount as number) || 0) + 1;
              }
            }
            writeFileSync(agentStorePath, JSON.stringify(agentStore, null, 2), 'utf-8');
          } catch {
            // Best-effort agent sync
          }
        }

        return {
          taskId: task.taskId,
          status: task.status,
          completedAt: task.completedAt,
          result: task.result,
        };
      }

      return {
        taskId,
        status: 'not_found',
        error: 'Task not found',
      };
    },
  },
  {
    name: 'task_update',
    description: 'Update task status or progress',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        status: { type: 'string', description: 'New status' },
        progress: { type: 'number', description: 'Progress percentage (0-100)' },
        assignTo: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to assign' },
      },
      required: ['taskId'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = input.taskId as string;
      const task = store.tasks[taskId];

      if (task) {
        if (input.status) {
          const newStatus = input.status as TaskRecord['status'];
          task.status = newStatus;
          if (newStatus === 'in_progress' && !task.startedAt) {
            task.startedAt = new Date().toISOString();
          }
        }
        if (typeof input.progress === 'number') {
          task.progress = Math.min(100, Math.max(0, input.progress as number));
        }
        if (input.assignTo) {
          task.assignedTo = input.assignTo as string[];
        }
        saveTaskStore(store);

        return {
          success: true,
          taskId: task.taskId,
          status: task.status,
          progress: task.progress,
          assignedTo: task.assignedTo,
        };
      }

      return {
        success: false,
        taskId,
        error: 'Task not found',
      };
    },
  },
  {
    name: 'task_assign',
    description: 'Assign a task to one or more agents',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to assign' },
        agentIds: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to assign' },
        unassign: { type: 'boolean', description: 'Unassign all agents from task' },
      },
      required: ['taskId'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = input.taskId as string;
      const task = store.tasks[taskId];

      if (!task) {
        return { taskId, error: 'Task not found' };
      }

      const previouslyAssigned = [...task.assignedTo];

      // Load agent store to sync worker state
      const agentStorePath = join(process.cwd(), STORAGE_DIR, 'agents.json');
      let agentStore: { agents: Record<string, Record<string, unknown>> } = { agents: {} };
      try {
        if (existsSync(agentStorePath)) {
          agentStore = JSON.parse(readFileSync(agentStorePath, 'utf-8'));
        }
      } catch { /* ignore */ }

      if (input.unassign) {
        // Revert previously assigned agents to idle
        for (const agentId of previouslyAssigned) {
          if (agentStore.agents[agentId]) {
            agentStore.agents[agentId].status = 'idle';
            agentStore.agents[agentId].currentTask = null;
          }
        }
        task.assignedTo = [];
      } else {
        const agentIds = (input.agentIds as string[]) || [];
        // Revert old agents to idle
        for (const agentId of previouslyAssigned) {
          if (!agentIds.includes(agentId) && agentStore.agents[agentId]) {
            agentStore.agents[agentId].status = 'idle';
            agentStore.agents[agentId].currentTask = null;
          }
        }
        // Set new agents to active
        for (const agentId of agentIds) {
          if (agentStore.agents[agentId]) {
            agentStore.agents[agentId].status = 'active';
            agentStore.agents[agentId].currentTask = taskId;
          }
        }
        task.assignedTo = agentIds;
        // Auto-transition task to in_progress if pending
        if (task.status === 'pending' && agentIds.length > 0) {
          task.status = 'in_progress';
          if (!task.startedAt) {
            task.startedAt = new Date().toISOString();
          }
        }
      }

      saveTaskStore(store);
      // Save agent store
      const agentDir = join(process.cwd(), STORAGE_DIR);
      if (!existsSync(agentDir)) {
        mkdirSync(agentDir, { recursive: true });
      }
      writeFileSync(agentStorePath, JSON.stringify(agentStore, null, 2), 'utf-8');

      // Dispatch to real agent process (fire-and-forget for each assigned agent)
      const dispatched: string[] = [];
      if (!input.unassign && task.assignedTo.length > 0) {
        const pm = getAgentProcessManager();
        for (const agentId of task.assignedTo) {
          try {
            const running = pm.getAgent(agentId);
            if (running && running.status !== 'dead') {
              // Execute async — don't block the MCP response
              pm.executeTask(agentId, taskId, task.description).catch(() => {
                // Update task on failure
                const s = loadTaskStore();
                if (s.tasks[taskId]) {
                  s.tasks[taskId].status = 'failed';
                  s.tasks[taskId].completedAt = new Date().toISOString();
                  saveTaskStore(s);
                }
              });
              dispatched.push(agentId);
            }
          } catch {
            // Agent not in process manager — skip
          }
        }
      }

      return {
        taskId: task.taskId,
        assignedTo: task.assignedTo,
        previouslyAssigned,
        status: task.status,
        dispatched,
      };
    },
  },
  {
    name: 'task_cancel',
    description: 'Cancel a task',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['taskId'],
    },
    handler: async (input) => {
      const store = loadTaskStore();
      const taskId = input.taskId as string;
      const task = store.tasks[taskId];

      if (task) {
        task.status = 'cancelled';
        task.completedAt = new Date().toISOString();
        task.result = { cancelReason: input.reason || 'Cancelled by user' };
        saveTaskStore(store);

        return {
          success: true,
          taskId: task.taskId,
          status: task.status,
          cancelledAt: task.completedAt,
        };
      }

      return {
        success: false,
        taskId,
        error: 'Task not found',
      };
    },
  },
  {
    name: 'task_execute',
    description: 'Execute a task on a running agent process immediately',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Existing task ID (or auto-creates one)' },
        agentId: { type: 'string', description: 'Agent to execute on (must be spawned)' },
        description: { type: 'string', description: 'Task description / prompt' },
      },
      required: ['agentId', 'description'],
    },
    handler: async (input) => {
      const agentId = input.agentId as string;
      const description = input.description as string;
      const store = loadTaskStore();

      // Create or reuse task record
      const taskId = (input.taskId as string)
        || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (!store.tasks[taskId]) {
        store.tasks[taskId] = {
          taskId,
          type: 'execution',
          description,
          priority: 'normal',
          status: 'in_progress',
          progress: 0,
          assignedTo: [agentId],
          tags: ['live-execution'],
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: null,
        };
        saveTaskStore(store);
      }

      // Execute on real process
      const pm = getAgentProcessManager();
      const agent = pm.getAgent(agentId);
      if (!agent || agent.status === 'dead') {
        return {
          success: false,
          taskId,
          agentId,
          error: `Agent ${agentId} is not running. Spawn it first with agent_spawn.`,
        };
      }

      try {
        const result = await pm.executeTask(agentId, taskId, description);

        // Update task store with result
        const updated = loadTaskStore();
        if (updated.tasks[taskId]) {
          updated.tasks[taskId].status = result.status === 'completed' ? 'completed' : 'failed';
          updated.tasks[taskId].completedAt = result.completedAt?.toISOString() ?? new Date().toISOString();
          updated.tasks[taskId].progress = result.status === 'completed' ? 100 : 0;
          updated.tasks[taskId].result = {
            output: result.output?.slice(0, 2000),
            error: result.error,
          };
          saveTaskStore(updated);
        }

        return {
          success: result.status === 'completed',
          taskId,
          agentId,
          status: result.status,
          output: result.output?.slice(0, 2000),
          error: result.error,
          durationMs: result.completedAt && result.startedAt
            ? new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()
            : undefined,
        };
      } catch (err) {
        return {
          success: false,
          taskId,
          agentId,
          error: (err as Error).message,
        };
      }
    },
  },
];
