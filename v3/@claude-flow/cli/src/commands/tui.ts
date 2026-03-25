/**
 * TUI Command — TypeScript handler layer for rfl interactive terminal
 *
 * Replaces Zsh+Python handlers with native TypeScript using MCP tools + output formatter.
 * Called via: ruflo tui <domain> <subcommand> [args...]
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { callMCPTool, MCPClientError } from '../mcp-client.js';
import { OutputFormatter } from '../output.js';

const out = new OutputFormatter();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface KV { [key: string]: unknown }

function parseArgs(args: string[]): { positional: string[]; flags: KV } {
  const positional: string[] = [];
  const flags: KV = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else { flags[key] = true; }
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else { flags[key] = true; }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function sc(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  const v = String(status ?? '');
  if (['active','running','healthy','completed','success','done','true'].some(k => s.includes(k)))
    return out.success(v);
  if (['error','failed','stopped','unhealthy','false','dead'].some(k => s.includes(k)))
    return out.error(v);
  if (['idle','pending','queued','waiting'].some(k => s.includes(k)))
    return out.warning(v);
  return out.dim(v);
}

function kvTable(data: KV, title?: string, skip: string[] = ['success']): void {
  if (title) { out.writeln(''); out.writeln(out.bold(title)); }
  const rows: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (skip.includes(k) || v === null || v === undefined || v === '') continue;
    let display: string;
    if (typeof v === 'object' && !Array.isArray(v)) display = '{...}';
    else if (Array.isArray(v)) display = `[${v.length} items]`;
    else if (typeof v === 'number' && !Number.isInteger(v)) display = v.toFixed(4);
    else display = String(v);
    rows.push({ field: k, value: sc(display) });
  }
  if (rows.length) {
    out.printTable({ columns: [{ key: 'field', header: 'Field' }, { key: 'value', header: 'Value' }], data: rows, border: true, header: true });
  } else {
    out.writeln(out.dim('  (no data)'));
  }
  out.writeln('');
}

function ok(msg: string): CommandResult {
  out.printSuccess(msg); return { success: true };
}
function fail(msg: string): CommandResult {
  out.printError(msg); return { success: false, exitCode: 1 };
}

async function tool<T = KV>(name: string, params: KV = {}): Promise<T> {
  return callMCPTool<T>(name, params);
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

async function handleAgent(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'list': {
      const data = await tool('agent_list');
      const agents = (data as KV).agents as KV[] ?? [];
      if (!agents.length) return ok('No agents');
      out.printTable({
        columns: [
          { key: 'status', header: 'Status', format: v => sc(v) },
          { key: 'type', header: 'Type' },
          { key: 'id', header: 'ID' },
        ],
        data: agents.map(a => ({
          status: a.status ?? a.agentStatus ?? '?',
          type: a.agentType ?? a.type ?? '?',
          id: a.agentId ?? a.id ?? '?',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'status': {
      const id = positional[0] ?? flags.id as string;
      if (!id) return fail('No agent ID');
      const data = await tool('agent_list');
      const agents = (data as KV).agents as KV[] ?? [];
      const agent = agents.find(a => (a.agentId ?? a.id) === id);
      if (!agent) return fail(`Agent not found: ${id}`);
      kvTable(agent as KV, id);
      return { success: true };
    }
    case 'spawn': {
      const type = (flags.t ?? flags.type ?? positional[0] ?? 'coder') as string;
      const name = (flags.name ?? positional[1]) as string | undefined;
      const params: KV = { agentType: type };
      if (name) params.name = name;
      const data = await tool('agent_spawn', params);
      const id = (data as KV).agentId ?? (data as KV).id;
      return id ? ok(`Agent spawned: ${id} (${type})`) : fail('Spawn failed');
    }
    case 'stop': {
      const id = positional[0] ?? flags.id as string;
      if (!id) return fail('No agent ID');
      const data = await tool('agent_terminate', { agentId: id });
      return (data as KV).success ? ok(`Agent stopped: ${id}`) : fail('Stop failed');
    }
    case 'pool': {
      const action = (positional[0] ?? 'status') as string;
      const params: KV = { action };
      if (flags.count) params.count = Number(flags.count);
      const data = await tool('agent_pool', params);
      kvTable(data as KV, 'Agent Pool');
      return { success: true };
    }
    case 'health': {
      const id = positional[0] ?? flags.id as string;
      if (!id) return fail('No agent ID');
      const data = await tool('agent_list');
      const agents = (data as KV).agents as KV[] ?? [];
      const agent = agents.find(a => (a.agentId ?? a.id) === id);
      if (!agent) return fail(`Agent not found: ${id}`);
      kvTable(agent as KV, `Health: ${id}`);
      return { success: true };
    }
    case 'metrics': {
      const data = await tool('coordination_metrics');
      kvTable(data as KV, 'Agent Metrics');
      return { success: true };
    }
    case 'logs': {
      const id = positional[0] ?? flags.id as string;
      if (!id) return fail('No agent ID');
      out.writeln(out.dim('(agent log passthrough not available in TUI mode)'));
      return { success: true };
    }
    default: return fail(`Unknown agent sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

async function handleMemory(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'list': {
      const data = await tool('memory_list');
      const d = data as KV;
      const items = (d.memories ?? d.items ?? d.entries ?? []) as KV[];
      if (!items.length) { out.writeln(out.dim('  (empty)')); return { success: true }; }
      out.printTable({
        columns: [{ key: 'key', header: 'Key' }, { key: 'value', header: 'Value', width: 80 }],
        data: items.map(m => ({
          key: m.key ?? m.id ?? '?',
          value: String(m.value ?? m.content ?? '').slice(0, 80),
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'search': {
      const query = (flags.q ?? flags.query ?? positional[0]) as string;
      if (!query) return fail('No query');
      const data = await tool('memory_search', { query });
      const d = data as KV;
      const results = (d.results ?? d.items ?? []) as KV[];
      out.writeln(out.dim(`  Results: ${d.total ?? results.length}  (${d.searchTime ?? ''})`));
      if (!results.length) { out.writeln(out.dim('  (no matches)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'key', header: 'Key' },
          { key: 'value', header: 'Value', width: 60 },
          { key: 'score', header: 'Score' },
        ],
        data: results.map(r => ({
          key: r.key ?? r.id ?? '?',
          value: String(r.value ?? r.content ?? '').slice(0, 60),
          score: r.score ?? r.similarity ?? '',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'store': {
      const key = (flags.k ?? flags.key ?? positional[0]) as string;
      const val = (flags.v ?? flags.value ?? positional[1]) as string;
      if (!key) return fail('No key');
      if (!val) return fail('No value');
      const data = await tool('memory_store', { key, value: val });
      return (data as KV).success ? ok(`Stored: ${key}`) : fail('Store failed');
    }
    case 'retrieve': {
      const key = (flags.k ?? flags.key ?? positional[0]) as string;
      if (!key) return fail('No key');
      const data = await tool('memory_retrieve', { key });
      const d = data as KV;
      out.writeln('');
      out.writeln(out.bold(key));
      out.writeln(`  ${d.value ?? d.content ?? d.data ?? ''}`);
      out.writeln('');
      return { success: true };
    }
    case 'delete': {
      const key = (flags.k ?? flags.key ?? positional[0]) as string;
      if (!key) return fail('No key');
      const data = await tool('memory_delete', { key });
      return (data as KV).success ? ok(`Deleted: ${key}`) : fail('Delete failed');
    }
    case 'stats': {
      const data = await tool('memory_stats');
      kvTable(data as KV, 'Memory Stats');
      return { success: true };
    }
    case 'init': case 'configure': case 'cleanup': case 'compress': case 'export': case 'import': {
      // These delegate to config/neural tools
      if (sub === 'compress') {
        const data = await tool('neural_compress');
        kvTable(data as KV, 'Memory Compress');
        return { success: true };
      }
      if (sub === 'stats' || sub === 'configure') {
        const data = await tool('memory_stats');
        kvTable(data as KV, 'Memory Config');
        return { success: true };
      }
      if (sub === 'export') {
        const data = await tool('config_export');
        kvTable(data as KV, 'Memory Export');
        return { success: true };
      }
      if (sub === 'import') {
        const path = positional[0] as string;
        if (!path) return fail('No source path');
        const data = await tool('config_import', { path });
        return (data as KV).success ? ok(`Imported from ${path}`) : fail('Import failed');
      }
      // init, cleanup — passthrough
      kvTable({}, `memory ${sub}`);
      return { success: true };
    }
    default: return fail(`Unknown memory sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

async function handleTask(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'list': {
      const data = await tool('task_list');
      const tasks = (data as KV).tasks as KV[] ?? [];
      if (!tasks.length) { out.writeln(out.dim('  (none)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'status', header: 'Status', format: v => sc(v) },
          { key: 'id', header: 'ID' },
          { key: 'assignee', header: 'Assignee' },
          { key: 'desc', header: 'Description', width: 40 },
        ],
        data: tasks.map(t => {
          let ass = t.assignedTo ?? '';
          if (Array.isArray(ass)) ass = ass.join(',');
          return {
            status: t.status ?? '?',
            id: t.taskId ?? t.id ?? '?',
            assignee: String(ass).slice(0, 18) || '-',
            desc: String(t.description ?? t.type ?? '').slice(0, 40),
          };
        }),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'status': {
      const tid = positional[0] ?? flags.id as string;
      if (!tid) return fail('No task ID');
      const data = await tool('task_list');
      const tasks = (data as KV).tasks as KV[] ?? [];
      const t = tasks.find(x => (x.taskId ?? x.id) === tid);
      if (!t) return fail(`Task not found: ${tid}`);
      kvTable(t as KV, tid);
      return { success: true };
    }
    case 'create': {
      const desc = (flags.d ?? flags.description ?? positional.join(' ')) as string;
      const type = (flags.t ?? flags.type ?? 'feature') as string;
      if (!desc) return fail('No description');
      const data = await tool('task_create', { type, description: desc, priority: 'high' });
      const tid = (data as KV).taskId ?? (data as KV).id;
      if (tid) {
        out.printSuccess(`Task: ${tid} (${type})`);
        out.writeln(out.dim(`  ${desc}`));
      } else return fail('Task creation failed');
      return { success: true };
    }
    case 'assign': {
      const tid = (flags.id ?? positional[0]) as string;
      const aid = (flags.a ?? flags.agent ?? positional[1]) as string;
      if (!tid) return fail('No task ID');
      if (!aid) return fail('No agent ID');
      const data = await tool('task_assign', { taskId: tid, agentIds: [aid] });
      return (data as KV).assignedTo ? ok(`${tid} -> ${aid}`) : fail('Assign failed');
    }
    case 'cancel': {
      const tid = positional[0] ?? flags.id as string;
      if (!tid) return fail('No task ID');
      const data = await tool('task_cancel', { taskId: tid });
      return (data as KV).success ? ok(`Task ${tid} cancelled`) : fail('Cancel failed');
    }
    case 'complete': {
      const tid = positional[0] ?? flags.id as string;
      if (!tid) return fail('No task ID');
      const data = await tool('task_complete', { taskId: tid });
      const d = data as KV;
      return (d.success || String(d.status).includes('completed'))
        ? ok(`Task ${tid} completed`) : fail('Complete failed');
    }
    case 'retry': {
      const tid = positional[0] ?? flags.id as string;
      if (!tid) return fail('No task ID');
      const data = await tool('task_update', { taskId: tid, status: 'pending' });
      return (data as KV).success || (data as KV).status ? ok(`Task ${tid} requeued`) : fail('Retry failed');
    }
    default: return fail(`Unknown task sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function handleSession(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'list': {
      const data = await tool('session_list');
      const sessions = (data as KV).sessions as KV[] ?? [];
      if (!sessions.length) { out.writeln(out.dim('  (none)')); return { success: true }; }
      out.printTable({
        columns: [{ key: 'id', header: 'ID' }, { key: 'name', header: 'Name' }],
        data: sessions.map(s => ({
          id: s.sessionId ?? s.id ?? '?',
          name: s.name ?? '',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'save': {
      const name = (flags.name ?? positional[0]) as string | undefined;
      const params: KV = {};
      if (name) params.name = name;
      const data = await tool('session_save', params);
      const sid = (data as KV).sessionId ?? (data as KV).id;
      return sid ? ok(`Session saved: ${sid}${name ? ` (${name})` : ''}`) : fail('Save failed');
    }
    case 'restore': {
      const sid = positional[0] ?? flags.id as string;
      if (!sid) return fail('No session ID');
      const data = await tool('session_restore', { sessionId: sid });
      return (data as KV).success ? ok(`Session restored: ${sid}`) : fail('Restore failed');
    }
    case 'delete': {
      const sid = positional[0] ?? flags.id as string;
      if (!sid) return fail('No session ID');
      const data = await tool('session_delete', { sessionId: sid });
      return (data as KV).success ? ok(`Session deleted: ${sid}`) : fail('Delete failed');
    }
    case 'current': {
      const data = await tool('session_current');
      kvTable(data as KV, 'Current Session');
      return { success: true };
    }
    case 'export': case 'import':
      out.writeln(out.dim(`(session ${sub} — use ruflo session ${sub} directly)`));
      return { success: true };
    default: return fail(`Unknown session sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Swarm
// ---------------------------------------------------------------------------

async function handleSwarm(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'status': {
      const [sw, pool, td] = await Promise.all([
        tool('swarm_status').catch(() => ({})),
        tool('agent_list').catch(() => ({ agents: [] })),
        tool('task_list').catch(() => ({ tasks: [] })),
      ]);
      const agents = ((pool as KV).agents ?? []) as KV[];
      const tasks = ((td as KV).tasks ?? []) as KV[];
      const nActive = agents.filter(a => ['active','running','in_progress'].includes(String(a.status))).length;
      const nIdle = agents.filter(a => a.status === 'idle').length;
      const nTaskActive = tasks.filter(t => ['in_progress','running','active'].includes(String(t.status))).length;
      const nPending = tasks.filter(t => ['pending','queued'].includes(String(t.status))).length;
      const nDone = tasks.filter(t => t.status === 'completed').length;

      out.writeln('');
      out.printTable({
        columns: [{ key: 'cat', header: '' }, { key: 'summary', header: 'Summary' }],
        data: [
          { cat: 'Agents', summary: `${out.success(String(nActive))} active  ${out.warning(String(nIdle))} idle  ${out.dim(String(agents.length - nActive - nIdle))} other` },
          { cat: 'Tasks', summary: `${out.success(String(nTaskActive))} active  ${out.warning(String(nPending))} pending  ${out.dim(String(nDone))} done` },
        ],
        border: true, header: true,
      });

      if (agents.length) {
        out.writeln('');
        out.printTable({
          columns: [
            { key: 'status', header: 'Status', format: v => sc(v) },
            { key: 'type', header: 'Type' },
            { key: 'id', header: 'ID' },
          ],
          data: agents.map(a => ({
            status: a.status ?? '?',
            type: a.agentType ?? a.type ?? '?',
            id: a.agentId ?? a.id ?? '?',
          })),
          border: true, header: true,
        });
      }

      if (tasks.length) {
        out.writeln('');
        out.printTable({
          columns: [
            { key: 'status', header: 'Status', format: v => sc(v) },
            { key: 'id', header: 'ID', width: 28 },
            { key: 'assignee', header: 'Assignee', width: 20 },
            { key: 'desc', header: 'Description', width: 36 },
          ],
          data: tasks.map(t => {
            let ass = t.assignedTo ?? '';
            if (Array.isArray(ass)) ass = ass.join(',');
            return {
              status: t.status ?? '?',
              id: String(t.taskId ?? t.id ?? '?').slice(0, 28),
              assignee: String(ass).slice(0, 20) || '-',
              desc: String(t.description ?? t.type ?? '').slice(0, 36),
            };
          }),
          border: true, header: true,
        });
      }
      out.writeln('');
      return { success: true };
    }
    case 'init': {
      const topo = (flags.topology ?? positional[0] ?? 'mesh') as string;
      const data = await tool('swarm_init', { topology: topo });
      const sid = (data as KV).swarmId ?? (data as KV).id;
      return sid ? ok(`Swarm: ${sid} (topology: ${topo})`) : fail('Swarm init failed');
    }
    case 'stop': {
      const data = await tool('swarm_stop');
      return (data as KV).success ? ok('Swarm stopped') : fail('Stop failed');
    }
    case 'scale': {
      const count = Number(positional[0] ?? flags.count ?? 0);
      if (!count) return fail('No agent count');
      const data = await tool('agent_pool', { action: 'scale', count });
      return (data as KV).success ? ok(`Swarm scaled to ${count} agents`) : fail('Scale failed');
    }
    case 'coordinate': {
      const task = (positional.join(' ') || flags.task) as string;
      if (!task) return fail('No task description');
      const data = await tool('coordination_orchestrate', { task });
      kvTable(data as KV, 'Coordinating');
      return { success: true };
    }
    default: return fail(`Unknown swarm sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

async function handleWorkflow(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'list': {
      const data = await tool('workflow_list');
      const wl = ((data as KV).workflows ?? (data as KV).items ?? []) as KV[];
      if (!wl.length) { out.writeln(out.dim('  (none)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status', format: v => sc(v) },
        ],
        data: wl.map(w => ({
          id: w.workflowId ?? w.id ?? '?',
          name: w.name ?? w.template ?? '',
          status: w.status ?? '',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'run': {
      const template = (positional.join(' ') || flags.template) as string;
      if (!template) return fail('No template');
      const data = await tool('workflow_run', { template });
      const wid = (data as KV).workflowId ?? (data as KV).id;
      return wid ? ok(`Workflow started: ${wid} (${template})`) : fail('Workflow run failed');
    }
    case 'status': {
      const wid = positional[0] ?? flags.id as string;
      if (!wid) return fail('No workflow ID');
      const data = await tool('workflow_list');
      const items = ((data as KV).workflows ?? (data as KV).items ?? []) as KV[];
      const w = items.find(x => (x.workflowId ?? x.id) === wid);
      if (!w) return fail(`Workflow not found: ${wid}`);
      kvTable(w as KV, wid);
      return { success: true };
    }
    case 'stop': {
      const wid = positional[0] ?? flags.id as string;
      if (!wid) return fail('No workflow ID');
      const data = await tool('workflow_cancel', { workflowId: wid });
      return (data as KV).success ? ok(`Workflow cancelled: ${wid}`) : fail('Cancel failed');
    }
    case 'template': {
      const data = await tool('workflow_template');
      const tpls = ((data as KV).templates ?? (data as KV).items ?? []) as KV[];
      if (!tpls.length) { out.writeln(out.dim('  (no templates)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'desc', header: 'Description', width: 60 },
        ],
        data: tpls.map(t => ({
          name: t.name ?? t.id ?? '?',
          desc: String(t.description ?? '').slice(0, 60),
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'validate': {
      const wid = positional[0] ?? flags.id as string;
      if (!wid) return fail('No workflow ID or template');
      // Validation isn't a standard MCP tool — output placeholder
      out.writeln(out.dim(`(workflow validate: use ruflo workflow validate ${wid} directly)`));
      return { success: true };
    }
    default: return fail(`Unknown workflow sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Neural
// ---------------------------------------------------------------------------

async function handleNeural(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'status': {
      const data = await tool('neural_status', { detailed: true });
      kvTable(data as KV, 'Neural Status');
      return { success: true };
    }
    case 'patterns': {
      const data = await tool('neural_patterns', { action: 'list' });
      const d = data as KV;
      const patterns = (d.patterns ?? []) as KV[];
      if (!patterns.length) { out.writeln(out.dim('  (none)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'type', header: 'Type' },
        ],
        data: patterns.map(p => ({
          id: p.id ?? p.patternId ?? '?',
          type: p.type ?? p.patternType ?? '?',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'predict': {
      const input = (positional.join(' ') || flags.input) as string;
      if (!input) return fail('No input');
      const data = await tool('neural_predict', { input });
      const d = data as KV;
      const preds = (d.predictions ?? d.results ?? []) as KV[];
      if (preds.length) {
        out.printTable({
          columns: [
            { key: 'label', header: 'Label' },
            { key: 'confidence', header: 'Confidence' },
          ],
          data: preds.map(p => ({
            label: p.label ?? p.class ?? '?',
            confidence: typeof p.confidence === 'number' ? p.confidence.toFixed(4) : String(p.confidence ?? ''),
          })),
          border: true, header: true,
        });
      } else {
        kvTable(d, 'Prediction');
      }
      return { success: true };
    }
    case 'train': {
      const params: KV = {};
      if (flags.type) params.modelType = flags.type;
      if (flags.epochs) params.epochs = Number(flags.epochs);
      if (flags['batch-size']) params.batchSize = Number(flags['batch-size']);
      if (flags['learning-rate']) params.learningRate = Number(flags['learning-rate']);
      const data = await tool('neural_train', params);
      const d = data as KV;
      if (d.modelId || d.status) {
        out.printSuccess(`Training started (${d.type ?? flags.type ?? 'default'})`);
        kvTable(d, undefined, ['success']);
      } else {
        return fail('Training failed');
      }
      return { success: true };
    }
    case 'optimize': {
      const target = (positional[0] ?? flags.target ?? 'balanced') as string;
      const data = await tool('neural_optimize', { target });
      kvTable(data as KV, 'Optimize');
      return { success: true };
    }
    case 'list': {
      const data = await tool('neural_list');
      const d = data as KV;
      const models = (d.models ?? []) as KV[];
      if (!models.length) { out.writeln(out.dim('  (no models)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status', format: v => sc(v) },
          { key: 'acc', header: 'Acc' },
          { key: 'epochs', header: 'Ep' },
          { key: 'trained', header: 'Trained' },
        ],
        data: models.map(m => ({
          id: m.id ?? m.modelId ?? '?',
          type: m.type ?? '?',
          status: m.status ?? '?',
          acc: typeof m.accuracy === 'number' ? m.accuracy.toFixed(4) : String(m.accuracy ?? ''),
          epochs: m.epochs ?? '',
          trained: m.trainedAt ?? '',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'benchmark': {
      const data = await tool('neural_benchmark');
      const d = data as KV;
      const results = (d.results ?? d.benchmarks ?? []) as KV[];
      if (results.length) {
        out.printTable({
          columns: [
            { key: 'model', header: 'Model' },
            { key: 'type', header: 'Type' },
            { key: 'latency', header: 'Latency' },
            { key: 'throughput', header: 'Throughput' },
            { key: 'iters', header: 'Iters' },
          ],
          data: results.map(r => ({
            model: r.modelId ?? r.model ?? '?',
            type: r.type ?? '?',
            latency: r.avgLatencyMs ? `${Number(r.avgLatencyMs).toFixed(2)}ms` : String(r.latency ?? ''),
            throughput: r.throughput ? `${Number(r.throughput).toFixed(1)}/s` : '',
            iters: r.iterations ?? '',
          })),
          border: true, header: true,
        });
      } else {
        kvTable(d, 'Benchmark');
      }
      return { success: true };
    }
    case 'export': {
      const modelId = positional[0] ?? flags.id as string;
      if (!modelId) return fail('No model ID');
      const data = await tool('neural_export', { modelId });
      kvTable(data as KV, `Export: ${modelId}`);
      return { success: true };
    }
    case 'import': {
      const source = positional[0] ?? flags.source as string;
      if (!source) return fail('No source');
      const modelType = (flags.type ?? 'transformer') as string;
      const data = await tool('neural_import', { source, modelType });
      const d = data as KV;
      return d.modelId ? ok(`Imported: ${d.modelId}`) : fail('Import failed');
    }
    default: return fail(`Unknown neural sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function handleConfig(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'get': {
      const key = positional[0] ?? flags.key as string;
      const params: KV = {};
      if (key) params.key = key;
      const data = await tool('config_get', params);
      kvTable(data as KV, key ? `Config: ${key}` : 'Config');
      return { success: true };
    }
    case 'set': {
      const key = (flags.k ?? flags.key ?? positional[0]) as string;
      const val = (flags.v ?? flags.value ?? positional[1]) as string;
      if (!key) return fail('No key');
      const data = await tool('config_set', { key, value: val ?? '' });
      return (data as KV).success ? ok(`Set ${key} = ${val}`) : fail('Set failed');
    }
    case 'reset': {
      const data = await tool('config_reset');
      return (data as KV).success ? ok('Config reset to defaults') : fail('Reset failed');
    }
    case 'init': {
      out.writeln(out.dim('(config init — use ruflo config init directly)'));
      return { success: true };
    }
    case 'providers': {
      const data = await tool('config_get', { key: 'providers' });
      kvTable(data as KV, 'Providers');
      return { success: true };
    }
    case 'export': {
      const data = await tool('config_export');
      const path = positional[0] as string;
      if (path) {
        const { writeFileSync } = await import('fs');
        writeFileSync(path, JSON.stringify(data, null, 2));
        return ok(`Config exported to ${path}`);
      }
      kvTable(data as KV, 'Config Export');
      return { success: true };
    }
    case 'import': {
      const source = positional[0] as string;
      if (!source) return fail('No source path');
      const data = await tool('config_import', { path: source });
      return (data as KV).success ? ok(`Config imported from ${source}`) : fail('Import failed');
    }
    default: return fail(`Unknown config sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

async function handleMcp(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'status': {
      const data = await tool('mcp_status');
      kvTable(data as KV, 'MCP Status');
      return { success: true };
    }
    case 'health': {
      const data = await tool('mcp_status');
      const d = data as KV;
      const rows: Record<string, unknown>[] = [
        { check: 'status', result: sc(d.running ? 'healthy' : 'unhealthy') },
      ];
      for (const k of ['uptime', 'connections', 'toolCount', 'memoryUsage', 'version']) {
        if (d[k] !== undefined && d[k] !== '') rows.push({ check: k, result: String(d[k]) });
      }
      out.writeln('');
      out.printTable({
        columns: [{ key: 'check', header: 'Check' }, { key: 'result', header: 'Result' }],
        data: rows, border: true, header: true,
      });
      out.writeln('');
      return { success: true };
    }
    case 'tools': {
      const data = await tool('mcp_status');
      const d = data as KV;
      const tools = (d.tools ?? d.availableTools ?? []) as (KV | string)[];
      out.writeln('');
      out.writeln(out.bold('MCP Tools'));
      if (Array.isArray(tools) && tools.length) {
        out.printTable({
          columns: [{ key: 'name', header: 'Tool' }, { key: 'desc', header: 'Description', width: 50 }],
          data: tools.map(t => typeof t === 'object'
            ? { name: (t as KV).name ?? '?', desc: String((t as KV).description ?? '').slice(0, 50) }
            : { name: String(t), desc: '' }),
          border: true, header: true,
        });
      } else {
        out.writeln(`  ${d.toolCount ?? d.totalTools ?? '?'} tools registered`);
      }
      out.writeln('');
      return { success: true };
    }
    case 'exec': {
      const toolName = (flags.tool ?? flags.t ?? positional[0]) as string;
      if (!toolName) return fail('No tool name');
      let params: KV = {};
      if (flags.p ?? flags.params) {
        try { params = JSON.parse(String(flags.p ?? flags.params)); } catch { /* ignore */ }
      }
      const data = await tool(toolName, params);
      kvTable(data as KV, toolName);
      return { success: true };
    }
    // start, stop, restart, toggle, logs — passthrough to ruflo CLI
    case 'start': case 'stop': case 'restart': case 'toggle': case 'logs':
      out.writeln(out.dim(`(mcp ${sub} — use ruflo mcp ${sub} directly)`));
      return { success: true };
    default: return fail(`Unknown mcp sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

async function handleHooks(sub: string, args: string[]): Promise<CommandResult> {
  switch (sub) {
    case 'list': {
      const data = await tool('hooks_list');
      const hooks = ((data as KV).hooks ?? (data as KV).items ?? []) as KV[];
      if (!hooks.length) { out.writeln(out.dim('  (no hooks)')); return { success: true }; }
      out.printTable({
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status', format: v => sc(v) },
        ],
        data: hooks.map(h => ({
          name: h.name ?? h.id ?? '?',
          type: h.type ?? h.event ?? '?',
          status: h.status ?? 'active',
        })),
        border: true, header: true,
      });
      return { success: true };
    }
    case 'metrics': {
      const data = await tool('hooks_metrics');
      kvTable(data as KV, 'Hook Metrics');
      return { success: true };
    }
    default:
      // All other hooks are best called via ruflo hooks <sub> directly
      out.writeln(out.dim(`(hooks ${sub} — use ruflo hooks ${sub} directly)`));
      return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

async function handleProgress(sub: string, _args: string[]): Promise<CommandResult> {
  switch (sub) {
    case 'check': case 'sync': case 'summary': {
      const data = await tool(`progress_${sub}`);
      kvTable(data as KV, `Progress ${sub}`);
      return { success: true };
    }
    case 'watch':
      out.writeln(out.dim('(progress watch — use ruflo progress watch directly)'));
      return { success: true };
    default: return fail(`Unknown progress sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Status (aliases)
// ---------------------------------------------------------------------------

async function handleStatus(sub: string, args: string[]): Promise<CommandResult> {
  switch (sub) {
    case 'agents':  return handleAgent('list', args);
    case 'tasks':   return handleTask('list', args);
    case 'memory':  return handleMemory('list', args);
    default: return fail(`Unknown status sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Hive-Mind
// ---------------------------------------------------------------------------

async function handleHiveMind(sub: string, args: string[]): Promise<CommandResult> {
  const { positional, flags } = parseArgs(args);
  switch (sub) {
    case 'init': {
      const topo = (flags.topology ?? positional[0] ?? 'hierarchical-mesh') as string;
      const data = await tool('hive-mind_init', { topology: topo });
      return (data as KV).success ? ok(`Hive-mind initialized (topology: ${topo})`) : fail('Hive init failed');
    }
    case 'spawn': {
      const atype = (flags.type ?? flags.t ?? positional[0]) as string;
      if (!atype) return fail('No agent type');
      const aid = `hive-${atype}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const spawnData = await tool('agent_spawn', { agentType: atype, agentId: aid });
      if (!(spawnData as KV).success && !(spawnData as KV).agentId) return fail(`${atype} spawn failed`);
      await tool('hive-mind_join', { agentId: aid }).catch(() => {});
      await tool('coordination_node', { nodeId: aid, role: 'worker', capabilities: [atype] }).catch(() => {});
      return ok(`${aid} (${atype}) joined hive`);
    }
    case 'status': {
      const [hm, pool] = await Promise.all([
        tool('hive-mind_status').catch(() => ({})),
        tool('agent_list').catch(() => ({ agents: [] })),
      ]);
      const agents = ((pool as KV).agents ?? []) as KV[];
      const hmData = hm as KV;
      if (Object.keys(hmData).length > 1) {
        const rows: Record<string, unknown>[] = [];
        for (const [key, label] of [['swarmId', 'Hive'], ['status', 'Status'], ['topology', 'Topology'], ['agentCount', 'Agents']] as const) {
          const v = hmData[key];
          if (v !== undefined && v !== '') rows.push({ field: label, value: sc(String(v)) });
        }
        if (rows.length) {
          out.writeln('');
          out.printTable({ columns: [{ key: 'field', header: 'Field' }, { key: 'value', header: 'Value' }], data: rows, border: true, header: true });
        }
      }
      if (agents.length) {
        out.writeln('');
        out.printTable({
          columns: [
            { key: 'status', header: 'Status', format: (v: unknown) => sc(v) },
            { key: 'type', header: 'Type' },
            { key: 'id', header: 'ID' },
          ],
          data: agents.map(a => ({
            status: a.status ?? '?',
            type: a.agentType ?? a.type ?? '?',
            id: a.agentId ?? a.id ?? '?',
          })),
          border: true, header: true,
        });
      } else {
        out.writeln(out.dim('  (no agents)'));
      }
      out.writeln('');
      return { success: true };
    }
    case 'task': {
      const desc = (positional.join(' ') || flags.d || flags.description) as string;
      if (!desc) return fail('No task description');
      const taskData = await tool('task_create', { type: 'feature', description: desc, priority: 'high' });
      const tid = (taskData as KV).taskId ?? (taskData as KV).id;
      if (!tid) return fail('Task creation failed');
      out.printSuccess(`Task: ${tid}`);
      try {
        const agentData = await tool('agent_list');
        const allAgents = ((agentData as KV).agents ?? []) as KV[];
        const idle = allAgents.find(a => ['idle', 'active'].includes(String(a.status)));
        if (idle) {
          const aid = idle.agentId ?? idle.id;
          await tool('task_assign', { taskId: tid, agentIds: [aid] });
          out.writeln(out.dim(`  Assigned to: ${aid}`));
        }
      } catch { /* auto-assign best-effort */ }
      await tool('hive-mind_broadcast', { message: `task: ${desc}`, taskId: tid, type: 'task' }).catch(() => {});
      out.writeln(out.dim('  Broadcast to hive'));
      try {
        const orchData = await tool('coordination_orchestrate', { taskId: tid, strategy: 'auto', description: desc });
        out.writeln(out.dim(`  Orchestration: ${(orchData as KV).success ? 'started' : 'queued'}`));
      } catch { /* best-effort */ }
      out.writeln('');
      out.writeln(out.dim(`  ${desc}`));
      return { success: true };
    }
    case 'join': {
      const ids = (positional.join(',') || String(flags.ids ?? '')).split(',').filter(Boolean);
      if (!ids.length) return fail('No agent IDs');
      let joined = 0;
      for (const aid of ids) {
        try {
          const data = await tool('hive-mind_join', { agentId: aid.trim() });
          if ((data as KV).success) {
            await tool('coordination_node', { nodeId: aid.trim(), role: 'worker' }).catch(() => {});
            out.writeln(`  ${out.success('[+]')} ${aid.trim()} joined hive`);
            joined++;
          } else {
            out.writeln(`  ${out.error('[x]')} ${aid.trim()} join failed`);
          }
        } catch { out.writeln(`  ${out.error('[x]')} ${aid.trim()} join failed`); }
      }
      if (joined > 0) {
        await tool('coordination_sync', { action: 'sync' }).catch(() => {});
        return ok(`${joined} agent(s) joined hive`);
      }
      return fail('No agents joined');
    }
    case 'leave': {
      const ids = (positional.join(',') || String(flags.ids ?? '')).split(',').filter(Boolean);
      if (!ids.length) return fail('No agent IDs');
      let left = 0;
      for (const aid of ids) {
        try {
          const data = await tool('hive-mind_leave', { agentId: aid.trim() });
          if ((data as KV).success) {
            out.writeln(`  ${out.success('[-]')} ${aid.trim()} left hive`);
            left++;
          } else {
            out.writeln(`  ${out.error('[x]')} ${aid.trim()} leave failed`);
          }
        } catch { out.writeln(`  ${out.error('[x]')} ${aid.trim()} leave failed`); }
      }
      return left > 0 ? ok(`${left} agent(s) left hive`) : fail('No agents left');
    }
    case 'consensus': {
      const topic = (positional.join(' ') || flags.topic) as string;
      if (!topic) return fail('No topic');
      const data = await tool('hive-mind_consensus', { topic });
      kvTable(data as KV, 'Consensus');
      return { success: true };
    }
    case 'broadcast': {
      const msg = (positional.join(' ') || flags.message || flags.m) as string;
      if (!msg) return fail('No message');
      const data = await tool('hive-mind_broadcast', { message: msg });
      if (!(data as KV).success) return fail('Broadcast failed');
      out.printSuccess('Broadcast sent to hive');
      await tool('hive-mind_memory', { action: 'store', key: `broadcast-${Date.now()}`, value: msg }).catch(() => {});
      await tool('coordination_sync', { action: 'broadcast', message: msg }).catch(() => {});
      out.writeln(out.dim('  Stored in hive memory + coordination synced'));
      out.writeln(out.dim(`  ${msg}`));
      return { success: true };
    }
    case 'memory': {
      out.writeln('');
      out.writeln(out.bold('Hive Memory'));
      const data = await tool('hive-mind_memory', { action: 'list' });
      const d = data as KV;
      const mems = (d.memories ?? d.items ?? d.entries ?? []) as KV[];
      if (!mems.length) { out.writeln(out.dim('  (empty)')); }
      else {
        out.printTable({
          columns: [{ key: 'key', header: 'Key' }, { key: 'value', header: 'Value', width: 80 }],
          data: mems.map(m => {
            if (typeof m === 'object' && m !== null) {
              return { key: (m as KV).key ?? (m as KV).id ?? '?', value: sc(String((m as KV).value ?? (m as KV).content ?? '').slice(0, 80)) };
            }
            return { key: String(m), value: '' };
          }),
          border: true, header: true,
        });
      }
      out.writeln('');
      return { success: true };
    }
    case 'optimize-memory': {
      const data = await tool('hive-mind_memory', { action: 'optimize' });
      return (data as KV).success ? ok('Hive memory optimized') : fail('Optimize failed');
    }
    case 'shutdown': {
      const data = await tool('hive-mind_shutdown');
      return (data as KV).success ? ok('Hive-mind shut down') : fail('Shutdown failed');
    }
    default: return fail(`Unknown hive-mind sub: ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

const DOMAINS: Record<string, (sub: string, args: string[]) => Promise<CommandResult>> = {
  agent: handleAgent,
  memory: handleMemory,
  task: handleTask,
  session: handleSession,
  swarm: handleSwarm,
  workflow: handleWorkflow,
  neural: handleNeural,
  config: handleConfig,
  mcp: handleMcp,
  hooks: handleHooks,
  progress: handleProgress,
  status: handleStatus,
  'hive-mind': handleHiveMind,
};

export const tuiCommand: Command = {
  name: 'tui',
  description: 'TUI handler layer — renders formatted output for rfl interactive terminal',
  aliases: ['t'],
  options: [
    { name: 'json', short: 'j', description: 'Output raw JSON', type: 'boolean' },
  ],
  examples: [
    { command: 'ruflo tui agent list', description: 'List agents with formatted table' },
    { command: 'ruflo tui memory search --query "auth"', description: 'Search memory' },
    { command: 'ruflo tui neural train --type transformer --epochs 20', description: 'Train model' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const [domain, sub, ...rest] = ctx.args;

    if (!domain || !sub) {
      out.writeln('Usage: ruflo tui <domain> <subcommand> [args...]');
      out.writeln('');
      out.writeln('Domains: ' + Object.keys(DOMAINS).join(', '));
      return { success: true };
    }

    const handler = DOMAINS[domain];
    if (!handler) {
      return fail(`Unknown domain: ${domain}`);
    }

    try {
      return await handler(sub, rest);
    } catch (error) {
      if (error instanceof MCPClientError) {
        return fail(`${error.toolName}: ${error.message}`);
      }
      return fail(String(error instanceof Error ? error.message : error));
    }
  },
};

export default tuiCommand;
