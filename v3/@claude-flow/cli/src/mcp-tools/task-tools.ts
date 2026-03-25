/**
 * Task MCP Tools for CLI
 *
 * Tool definitions for task management with file persistence
 * AND real execution via AgentProcessManager.
 */

import type { MCPTool } from './types.js';
import { getAgentProcessManager } from '../services/agent-process-manager.js';
import { StateDB } from '../state-db.js';
import { TaskDAO } from '../dao/task-dao.js';
import { AgentDAO } from '../dao/agent-dao.js';

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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const assignTo = (input.assignTo as string[]) || [];

      const task = tasks.create({
        type: input.type as string,
        description: input.description as string,
        priority: (input.priority as string) || 'normal',
        assignedAgent: assignTo[0] || undefined,
        tags: (input.tags as string[]) || [],
      });

      // If agents are assigned at creation, auto-dispatch execution
      const dispatched: string[] = [];
      if (assignTo.length > 0) {
        const pm = getAgentProcessManager();
        for (const agentId of assignTo) {
          try {
            const running = pm.getAgent(agentId);
            if (running && running.status !== 'dead') {
              pm.executeTask(agentId, task.id, task.description!).catch(() => {
                tasks.update(task.id, {
                  status: 'failed',
                  completedAt: new Date().toISOString(),
                });
              });
              dispatched.push(agentId);
            }
          } catch {
            // Agent not in process manager — skip
          }
        }
      }

      return {
        taskId: task.id,
        type: task.type,
        description: task.description,
        priority: task.priority,
        status: task.status,
        createdAt: task.createdAt,
        assignedTo: task.assignedAgent ? [task.assignedAgent] : [],
        tags: [],
        dispatched: dispatched.length > 0 ? dispatched : undefined,
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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const taskId = input.taskId as string;
      const task = tasks.get(taskId);

      if (task) {
        return {
          taskId: task.id,
          type: task.type,
          description: task.description,
          status: task.status,
          progress: 0,
          priority: task.priority,
          assignedTo: task.assignedAgent ? [task.assignedAgent] : [],
          tags: [],
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
      const db = StateDB.getInstance();
      const dao = new TaskDAO(db.database);

      // TaskDAO.list handles status, type, assignedAgent, priority, limit filters
      let taskList = dao.list({
        status: input.status as string | undefined,
        type: input.type as string | undefined,
        assignedAgent: input.assignedTo as string | undefined,
        priority: input.priority as string | undefined,
        limit: (input.limit as number) || 50,
      });

      // Support comma-separated status values (not handled by DAO)
      if (input.status && (input.status as string).includes(',')) {
        const statuses = (input.status as string).split(',').map(s => s.trim());
        const allTasks = dao.list({ limit: (input.limit as number) || 50 });
        taskList = allTasks.filter(t => statuses.includes(t.status));
      }

      return {
        tasks: taskList.map(t => ({
          taskId: t.id,
          type: t.type,
          description: t.description,
          status: t.status,
          progress: 0,
          priority: t.priority,
          assignedTo: t.assignedAgent ? [t.assignedAgent] : [],
          createdAt: t.createdAt,
        })),
        total: taskList.length,
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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const taskId = input.taskId as string;
      const task = tasks.get(taskId);

      if (task) {
        // Atomic: updates task + resets assigned agent in one transaction
        tasks.complete(taskId, (input.result as Record<string, unknown>) || {});
        const completed = tasks.get(taskId)!;

        return {
          taskId: completed.id,
          status: completed.status,
          completedAt: completed.completedAt,
          result: completed.output,
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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const taskId = input.taskId as string;
      const task = tasks.get(taskId);

      if (task) {
        const changes: Record<string, unknown> = {};
        if (input.status) {
          changes.status = input.status as string;
          if (input.status === 'in_progress' && !task.startedAt) {
            changes.startedAt = new Date().toISOString();
          }
        }
        if (input.assignTo) {
          changes.assignedAgent = (input.assignTo as string[])[0] || null;
        }
        tasks.update(taskId, changes);
        const updated = tasks.get(taskId)!;

        return {
          success: true,
          taskId: updated.id,
          status: updated.status,
          progress: 0,
          assignedTo: updated.assignedAgent ? [updated.assignedAgent] : [],
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
      const db = StateDB.getInstance();
      const taskDao = new TaskDAO(db.database);
      const agentDao = new AgentDAO(db.database);
      const taskId = input.taskId as string;
      const task = taskDao.get(taskId);

      if (!task) {
        return { taskId, error: 'Task not found' };
      }

      const previouslyAssigned = task.assignedAgent ? [task.assignedAgent] : [];

      if (input.unassign) {
        // Revert previously assigned agents to idle
        for (const agentId of previouslyAssigned) {
          agentDao.update(agentId, { status: 'idle', currentTask: undefined });
        }
        taskDao.update(taskId, { assignedAgent: null as any });
      } else {
        const agentIds = (input.agentIds as string[]) || [];
        // Revert old agents to idle
        for (const agentId of previouslyAssigned) {
          if (!agentIds.includes(agentId)) {
            agentDao.update(agentId, { status: 'idle', currentTask: undefined });
          }
        }
        // Assign first agent atomically (task_assign uses TaskDAO.assign for atomicity)
        if (agentIds.length > 0) {
          taskDao.assign(taskId, agentIds[0]);
        }
      }

      const updatedTask = taskDao.get(taskId)!;

      // Dispatch to real agent process (fire-and-forget)
      const dispatched: string[] = [];
      const assignedAgents = updatedTask.assignedAgent ? [updatedTask.assignedAgent] : [];
      if (!input.unassign && assignedAgents.length > 0) {
        const pm = getAgentProcessManager();
        for (const agentId of assignedAgents) {
          try {
            const running = pm.getAgent(agentId);
            if (running && running.status !== 'dead') {
              pm.executeTask(agentId, taskId, updatedTask.description!).catch(() => {
                taskDao.update(taskId, {
                  status: 'failed',
                  completedAt: new Date().toISOString(),
                });
              });
              dispatched.push(agentId);
            }
          } catch {
            // Agent not in process manager — skip
          }
        }
      }

      return {
        taskId: updatedTask.id,
        assignedTo: assignedAgents,
        previouslyAssigned,
        status: updatedTask.status,
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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const taskId = input.taskId as string;
      const task = tasks.get(taskId);

      if (task) {
        const now = new Date().toISOString();
        tasks.update(taskId, {
          status: 'cancelled',
          completedAt: now,
          output: { cancelReason: input.reason || 'Cancelled by user' },
        });

        return {
          success: true,
          taskId,
          status: 'cancelled',
          cancelledAt: now,
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
      const db = StateDB.getInstance();
      const tasks = new TaskDAO(db.database);
      const agentId = input.agentId as string;
      const description = input.description as string;

      // Create or reuse task record
      const taskId = (input.taskId as string)
        || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (!tasks.get(taskId)) {
        tasks.create({
          id: taskId,
          type: 'execution',
          description,
          assignedAgent: agentId,
        });
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

        // Update task with result
        tasks.update(taskId, {
          status: result.status === 'completed' ? 'completed' : 'failed',
          completedAt: result.completedAt?.toISOString() ?? new Date().toISOString(),
          output: {
            output: result.output?.slice(0, 2000),
            error: result.error,
          },
        });

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
