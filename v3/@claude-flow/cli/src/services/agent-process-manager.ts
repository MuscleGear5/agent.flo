/**
 * Agent Process Manager
 *
 * Spawns and manages real agent processes using Claude Code headless mode.
 * Each agent gets a real child process that can execute tasks.
 *
 * Lifecycle:
 *   agent_spawn  → fork a `claude --print` process with the agent's role prompt
 *   task assign  → feed task to running agent via executeTask()
 *   agent_status → report real PID, memory, uptime
 *   agent_terminate → SIGTERM the child process
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────

export type AgentModel = 'haiku' | 'sonnet' | 'opus';

export interface AgentProcessConfig {
  agentId: string;
  agentType: string;
  model: AgentModel;
  systemPrompt?: string;
  maxConcurrentTasks?: number;
  timeoutMs?: number;
  sandbox?: 'strict' | 'permissive' | 'disabled';
}

export interface RunningAgent {
  config: AgentProcessConfig;
  pid: number;
  process: ChildProcess;
  status: 'starting' | 'idle' | 'busy' | 'stopping' | 'dead';
  startedAt: Date;
  taskCount: number;
  currentTask: string | null;
  lastOutput: string;
  lastError: string;
}

export interface TaskExecution {
  taskId: string;
  agentId: string;
  description: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
}

// ── Model IDs ──────────────────────────────────────────

const MODEL_IDS: Record<AgentModel, string> = {
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

// ── Role prompts by agent type ─────────────────────────

const AGENT_ROLE_PROMPTS: Record<string, string> = {
  coder: 'You are a coding agent. Implement features, fix bugs, and write clean code. Output only the code changes needed.',
  researcher: 'You are a research agent. Analyze codebases, find patterns, and report findings. Be thorough and precise.',
  tester: 'You are a testing agent. Write comprehensive tests, find edge cases, and validate correctness.',
  reviewer: 'You are a code review agent. Check for bugs, security issues, style violations, and suggest improvements.',
  architect: 'You are a system architect agent. Design APIs, plan data models, and make structural decisions.',
  'security-architect': 'You are a security agent. Audit for vulnerabilities, check dependencies, and enforce security best practices.',
  'performance-engineer': 'You are a performance agent. Profile, benchmark, and optimize code for speed and memory.',
  coordinator: 'You are a coordination agent. Break down tasks, assign work, track progress, and synthesize results.',
  analyst: 'You are a code analysis agent. Measure complexity, find dead code, and suggest refactoring opportunities.',
  optimizer: 'You are an optimization agent. Identify bottlenecks and apply targeted performance improvements.',
};

// ── Process Manager ────────────────────────────────────

export class AgentProcessManager extends EventEmitter {
  private agents: Map<string, RunningAgent> = new Map();
  private taskQueue: Map<string, TaskExecution[]> = new Map();  // agentId → tasks
  private completedTasks: Map<string, TaskExecution> = new Map();
  private projectRoot: string;
  private logDir: string;
  private stateFile: string;

  constructor(projectRoot?: string) {
    super();
    this.projectRoot = projectRoot || process.cwd();
    this.logDir = join(this.projectRoot, '.claude-flow', 'logs', 'agents');
    this.stateFile = join(this.projectRoot, '.claude-flow', 'agent-processes.json');
    this.ensureDirs();
    this.loadState();
  }

  private ensureDirs(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  // ── Spawn ────────────────────────────────────────────

  async spawn(config: AgentProcessConfig): Promise<RunningAgent> {
    if (this.agents.has(config.agentId)) {
      const existing = this.agents.get(config.agentId)!;
      if (existing.status !== 'dead') {
        throw new Error(`Agent ${config.agentId} is already running (PID ${existing.pid})`);
      }
    }

    const rolePrompt = config.systemPrompt
      || AGENT_ROLE_PROMPTS[config.agentType]
      || `You are a ${config.agentType} agent. Execute assigned tasks efficiently.`;

    const prompt = [
      rolePrompt,
      '',
      `Agent ID: ${config.agentId}`,
      `Type: ${config.agentType}`,
      `Model: ${config.model}`,
      '',
      'Waiting for task assignment. Respond with "READY" to confirm initialization.',
    ].join('\n');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CLAUDE_CODE_HEADLESS: 'true',
      ANTHROPIC_MODEL: MODEL_IDS[config.model],
    };

    if (config.sandbox && config.sandbox !== 'disabled') {
      env.CLAUDE_CODE_SANDBOX_MODE = config.sandbox;
    }

    const child = spawn('claude', ['--print', prompt], {
      cwd: this.projectRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    const agent: RunningAgent = {
      config,
      pid: child.pid || 0,
      process: child,
      status: 'starting',
      startedAt: new Date(),
      taskCount: 0,
      currentTask: null,
      lastOutput: '',
      lastError: '',
    };

    // Collect output
    let initOutput = '';
    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      agent.lastOutput = chunk.slice(-2000);  // Keep last 2KB
      initOutput += chunk;
      this.log(config.agentId, 'stdout', chunk);
      this.emit('agent:output', { agentId: config.agentId, data: chunk });
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      agent.lastError = chunk.slice(-2000);
      this.log(config.agentId, 'stderr', chunk);
    });

    child.on('exit', (code, signal) => {
      agent.status = 'dead';
      agent.process = null as unknown as ChildProcess;
      this.log(config.agentId, 'exit', `code=${code} signal=${signal}`);
      this.emit('agent:exit', { agentId: config.agentId, code, signal });
      this.saveState();
    });

    child.on('error', (err) => {
      agent.status = 'dead';
      agent.lastError = err.message;
      this.log(config.agentId, 'error', err.message);
      this.emit('agent:error', { agentId: config.agentId, error: err.message });
    });

    this.agents.set(config.agentId, agent);
    this.taskQueue.set(config.agentId, []);

    // Wait briefly for initialization
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        agent.status = 'idle';
        resolve();
      }, 3000);

      const checkReady = () => {
        if (initOutput.includes('READY') || initOutput.length > 0) {
          clearTimeout(timeout);
          agent.status = 'idle';
          resolve();
        }
      };

      child.stdout?.on('data', checkReady);
    });

    this.saveState();
    this.emit('agent:spawned', { agentId: config.agentId, pid: agent.pid, model: config.model });
    return agent;
  }

  // ── Execute Task ─────────────────────────────────────

  async executeTask(agentId: string, taskId: string, description: string): Promise<TaskExecution> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === 'dead') {
      // Agent not running — spawn on demand with task
      throw new Error(`Agent ${agentId} is not running. Spawn it first.`);
    }

    const execution: TaskExecution = {
      taskId,
      agentId,
      description,
      status: 'running',
      startedAt: new Date(),
    };

    agent.status = 'busy';
    agent.currentTask = taskId;
    agent.taskCount++;

    const timeoutMs = agent.config.timeoutMs || 5 * 60 * 1000;
    const model = agent.config.model;

    // Build the task prompt
    const taskPrompt = [
      `Execute the following task:`,
      '',
      `Task ID: ${taskId}`,
      `Description: ${description}`,
      '',
      `Work in ${this.projectRoot}. Output your results clearly.`,
    ].join('\n');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CLAUDE_CODE_HEADLESS: 'true',
      ANTHROPIC_MODEL: MODEL_IDS[model],
    };

    return new Promise<TaskExecution>((resolve) => {
      const child = spawn('claude', ['--print', taskPrompt], {
        cwd: this.projectRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        agent.lastOutput = stdout.slice(-2000);
        this.emit('task:output', { agentId, taskId, data: data.toString() });
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        execution.completedAt = new Date();
        execution.output = stdout;

        if (code === 0) {
          execution.status = 'completed';
        } else {
          execution.status = 'failed';
          execution.error = stderr || `Process exited with code ${code}`;
        }

        agent.status = 'idle';
        agent.currentTask = null;
        this.completedTasks.set(taskId, execution);
        this.saveState();
        this.emit('task:complete', { agentId, taskId, status: execution.status });
        resolve(execution);
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        execution.status = 'failed';
        execution.error = err.message;
        execution.completedAt = new Date();
        agent.status = 'idle';
        agent.currentTask = null;
        this.completedTasks.set(taskId, execution);
        this.saveState();
        resolve(execution);
      });

      this.log(agentId, 'task-start', `${taskId}: ${description}`);
    });
  }

  // ── Terminate ────────────────────────────────────────

  terminate(agentId: string, force = false): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === 'dead') return false;

    agent.status = 'stopping';
    const signal = force ? 'SIGKILL' : 'SIGTERM';

    try {
      agent.process?.kill(signal);
    } catch {
      // Process may already be dead
    }

    if (!force) {
      setTimeout(() => {
        if (agent.status === 'stopping') {
          try { agent.process?.kill('SIGKILL'); } catch { /* noop */ }
        }
      }, 5000);
    }

    this.saveState();
    return true;
  }

  terminateAll(force = false): number {
    let count = 0;
    for (const agentId of Array.from(this.agents.keys())) {
      if (this.terminate(agentId, force)) count++;
    }
    return count;
  }

  // ── Status ───────────────────────────────────────────

  getAgent(agentId: string): RunningAgent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): Array<{
    agentId: string;
    agentType: string;
    model: AgentModel;
    pid: number;
    status: string;
    startedAt: Date;
    taskCount: number;
    currentTask: string | null;
    uptimeMs: number;
  }> {
    return Array.from(this.agents.values())
      .filter(a => a.status !== 'dead')
      .map(a => ({
        agentId: a.config.agentId,
        agentType: a.config.agentType,
        model: a.config.model,
        pid: a.pid,
        status: a.status,
        startedAt: a.startedAt,
        taskCount: a.taskCount,
        currentTask: a.currentTask,
        uptimeMs: Date.now() - a.startedAt.getTime(),
      }));
  }

  getTaskResult(taskId: string): TaskExecution | undefined {
    return this.completedTasks.get(taskId);
  }

  // ── Logging ──────────────────────────────────────────

  private log(agentId: string, level: string, message: string): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${agentId}] [${level}] ${message}\n`;
    try {
      appendFileSync(join(this.logDir, `${agentId}.log`), line);
    } catch {
      // Best effort logging
    }
  }

  // ── State persistence ────────────────────────────────

  private saveState(): void {
    const state = {
      agents: Array.from(this.agents.entries()).map(([id, a]) => ({
        agentId: id,
        agentType: a.config.agentType,
        model: a.config.model,
        pid: a.pid,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        taskCount: a.taskCount,
        currentTask: a.currentTask,
      })),
      completedTasks: Array.from(this.completedTasks.entries()).map(([id, t]) => ({
        taskId: id,
        agentId: t.agentId,
        status: t.status,
        completedAt: t.completedAt?.toISOString(),
        output: t.output?.slice(0, 500),
        error: t.error,
      })),
      updatedAt: new Date().toISOString(),
    };

    try {
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch {
      // Best effort
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.stateFile)) {
        const data = JSON.parse(readFileSync(this.stateFile, 'utf-8'));
        // Mark all previously running agents as dead (they can't survive a restart)
        for (const a of data.agents || []) {
          if (a.status !== 'dead') {
            a.status = 'dead';
          }
        }
        // Restore completed tasks
        for (const t of data.completedTasks || []) {
          this.completedTasks.set(t.taskId, t as TaskExecution);
        }
      }
    } catch {
      // Fresh start
    }
  }
}

// ── Singleton ──────────────────────────────────────────

let _instance: AgentProcessManager | null = null;

export function getAgentProcessManager(projectRoot?: string): AgentProcessManager {
  if (!_instance) {
    _instance = new AgentProcessManager(projectRoot);
  }
  return _instance;
}
