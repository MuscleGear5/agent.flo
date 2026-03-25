#!/usr/bin/env node
/**
 * Beads Router MCP - Dynamic Context Optimization
 *
 * Instead of loading 81 tool schemas into context, this exposes 3 tools:
 * - bd_discover: Search/list available commands
 * - bd_info: Get full JSON schema for a specific command
 * - bd_exec: Execute a command with validated arguments
 *
 * Context reduction: 81 schemas → 3 schemas (~27x smaller)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);
const escapeArg = (str) => `"${String(str || '').replace(/"/g, '\\"')}"`;

// ============ BEADS CLIENT ============

class BeadsClient {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }

  async run(args, options = {}) {
    try {
      const { stdout, stderr } = await exec(`bd ${args}`, {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        ...options
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, stdout: error.stdout || '', stderr: error.stderr || error.message, code: error.code };
    }
  }
}

// ============ FULL TOOL REGISTRY ============
// All 81 commands - schemas stored here, only exposed on-demand via bd_info

const TOOL_REGISTRY = {
  // === Working With Issues ===
  beads_create: {
    description: 'Create a new issue (bd create)',
    category: 'issues',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body/description' },
        type: { type: 'string', description: 'Issue type (feature, bug, task, etc.)' },
        parent: { type: 'string', description: 'Parent issue ID' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
        priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
        assignee: { type: 'string', description: 'Assign to user' },
        state: { type: 'string', description: 'Initial state dimensions (e.g., "status:in-progress")' }
      },
      required: ['title']
    },
    cmd: (a) => {
      let c = `create ${escapeArg(a.title)}`;
      if (a.body) c += ` --body ${escapeArg(a.body)}`;
      if (a.type) c += ` --type ${a.type}`;
      if (a.parent) c += ` --parent ${a.parent}`;
      if (a.labels) a.labels.forEach(l => c += ` --label ${escapeArg(l)}`);
      if (a.priority) c += ` --label priority:${a.priority}`;
      if (a.assignee) c += ` --assignee ${a.assignee}`;
      if (a.state) c += ` --state ${a.state}`;
      return c;
    }
  },
  beads_list: {
    description: 'List issues (bd list)',
    category: 'issues',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        type: { type: 'string', description: 'Filter by type' },
        label: { type: 'string', description: 'Filter by label' },
        assignee: { type: 'string', description: 'Filter by assignee' },
        parent: { type: 'string', description: 'Filter by parent' },
        limit: { type: 'number', description: 'Max results' },
        json: { type: 'boolean', description: 'Output as JSON' }
      }
    },
    cmd: (a) => {
      let c = 'list';
      if (a.status) c += ` --status ${a.status}`;
      if (a.type) c += ` --type ${a.type}`;
      if (a.label) c += ` --label ${a.label}`;
      if (a.assignee) c += ` --assignee ${a.assignee}`;
      if (a.parent) c += ` --parent ${a.parent}`;
      if (a.limit) c += ` --limit ${a.limit}`;
      if (a.json) c += ' --json';
      return c;
    }
  },
  beads_show: {
    description: 'Show issue details (bd show)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, json: { type: 'boolean', description: 'Output as JSON' } }, required: ['id'] },
    cmd: (a) => { let c = `show ${a.id}`; if (a.json) c += ' --json'; return c; }
  },
  beads_update: {
    description: 'Update an issue (bd update)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, title: { type: 'string', description: 'New title' }, body: { type: 'string', description: 'New body' }, type: { type: 'string', description: 'New type' }, addLabel: { type: 'array', items: { type: 'string' }, description: 'Labels to add' }, removeLabel: { type: 'array', items: { type: 'string' }, description: 'Labels to remove' } }, required: ['id'] },
    cmd: (a) => { let c = `update ${a.id}`; if (a.title) c += ` --title ${escapeArg(a.title)}`; if (a.body) c += ` --body ${escapeArg(a.body)}`; if (a.type) c += ` --type ${a.type}`; if (a.addLabel) a.addLabel.forEach(l => c += ` --add-label ${escapeArg(l)}`); if (a.removeLabel) a.removeLabel.forEach(l => c += ` --remove-label ${escapeArg(l)}`); return c; }
  },
  beads_close: {
    description: 'Close one or more issues (bd close)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to close' }, reason: { type: 'string', description: 'Close reason' }, comment: { type: 'string', description: 'Closing comment' } }, required: ['ids'] },
    cmd: (a) => { const ids = Array.isArray(a.ids) ? a.ids.join(' ') : a.ids; let c = `close ${ids}`; if (a.reason) c += ` --reason ${escapeArg(a.reason)}`; if (a.comment) c += ` --comment ${escapeArg(a.comment)}`; return c; }
  },
  beads_reopen: {
    description: 'Reopen closed issues (bd reopen)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to reopen' } }, required: ['ids'] },
    cmd: (a) => `reopen ${Array.isArray(a.ids) ? a.ids.join(' ') : a.ids}`
  },
  beads_delete: {
    description: 'Delete issues (bd delete)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to delete' }, force: { type: 'boolean', description: 'Force delete without confirmation' } }, required: ['ids'] },
    cmd: (a) => { const ids = Array.isArray(a.ids) ? a.ids.join(' ') : a.ids; let c = `delete ${ids}`; if (a.force) c += ' --force'; return c; }
  },
  beads_edit: {
    description: 'Edit an issue field in $EDITOR (bd edit)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, field: { type: 'string', description: 'Field to edit (title, body, type)' } }, required: ['id'] },
    cmd: (a) => { let c = `edit ${a.id}`; if (a.field) c += ` --field ${a.field}`; return c; }
  },
  beads_search: {
    description: 'Search issues by text (bd search)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, json: { type: 'boolean', description: 'Output as JSON' } }, required: ['query'] },
    cmd: (a) => { let c = `search ${escapeArg(a.query)}`; if (a.json) c += ' --json'; return c; }
  },
  beads_query: {
    description: 'Query issues using beads query language (bd query)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Query expression' }, json: { type: 'boolean', description: 'Output as JSON' } }, required: ['query'] },
    cmd: (a) => { let c = `query '${a.query}'`; if (a.json) c += ' --json'; return c; }
  },
  beads_q: {
    description: 'Quick capture - create issue and output only ID (bd q)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Issue title' }, type: { type: 'string', description: 'Issue type' } }, required: ['title'] },
    cmd: (a) => { let c = `q ${escapeArg(a.title)}`; if (a.type) c += ` --type ${a.type}`; return c; }
  },
  beads_create_form: {
    description: 'Create issue using interactive form (bd create-form)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { template: { type: 'string', description: 'Form template to use' } } },
    cmd: (a) => { let c = 'create-form'; if (a.template) c += ` --template ${a.template}`; return c; }
  },

  // === Comments ===
  beads_comments: {
    description: 'View or manage comments (bd comments)',
    category: 'collaboration',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, add: { type: 'string', description: 'Add comment text' }, edit: { type: 'string', description: 'Comment ID to edit' }, delete: { type: 'string', description: 'Comment ID to delete' } }, required: ['id'] },
    cmd: (a) => { let c = `comments ${a.id}`; if (a.add) c += ` --add ${escapeArg(a.add)}`; if (a.edit) c += ` --edit ${a.edit}`; if (a.delete) c += ` --delete ${a.delete}`; return c; }
  },

  // === Labels ===
  beads_label: {
    description: 'Manage issue labels (bd label)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, add: { type: 'array', items: { type: 'string' }, description: 'Labels to add' }, remove: { type: 'array', items: { type: 'string' }, description: 'Labels to remove' }, set: { type: 'array', items: { type: 'string' }, description: 'Set labels (replace all)' } }, required: ['id'] },
    cmd: (a) => { let c = `label ${a.id}`; if (a.add) a.add.forEach(l => c += ` --add ${escapeArg(l)}`); if (a.remove) a.remove.forEach(l => c += ` --remove ${escapeArg(l)}`); if (a.set) a.set.forEach(l => c += ` --set ${escapeArg(l)}`); return c; }
  },

  // === State Management ===
  beads_set_state: {
    description: 'Set operational state (bd set-state)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, state: { type: 'string', description: 'State dimension (e.g., "status:in-progress")' } }, required: ['id', 'state'] },
    cmd: (a) => `set-state ${a.id} ${a.state}`
  },
  beads_state: {
    description: 'Query current state dimension value (bd state)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { dimension: { type: 'string', description: 'State dimension to query' } } },
    cmd: (a) => { let c = 'state'; if (a.dimension) c += ` ${a.dimension}`; return c; }
  },

  // === Dependencies ===
  beads_dep: {
    description: 'Manage dependencies (bd dep)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'Action to perform' }, id: { type: 'string', description: 'Issue ID' }, dependsOn: { type: 'string', description: 'Issue ID this depends on' } }, required: ['action'] },
    cmd: (a) => { let c = `dep ${a.action}`; if (a.id) c += ` ${a.id}`; if (a.dependsOn) c += ` ${a.dependsOn}`; return c; }
  },
  beads_children: {
    description: 'List child issues of a parent (bd children)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Parent issue ID' }, json: { type: 'boolean', description: 'Output as JSON' } }, required: ['id'] },
    cmd: (a) => { let c = `children ${a.id}`; if (a.json) c += ' --json'; return c; }
  },
  beads_graph: {
    description: 'Display dependency graph (bd graph)',
    category: 'visualization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Root issue ID' }, format: { type: 'string', enum: ['text', 'dot', 'mermaid'], description: 'Output format' } } },
    cmd: (a) => { let c = 'graph'; if (a.id) c += ` ${a.id}`; if (a.format) c += ` --format ${a.format}`; return c; }
  },

  // === Epics ===
  beads_epic: {
    description: 'Epic management commands (bd epic)',
    category: 'planning',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'list', 'show', 'add-child', 'remove-child'], description: 'Action' }, id: { type: 'string', description: 'Epic ID' }, title: { type: 'string', description: 'Epic title' }, childId: { type: 'string', description: 'Child issue ID' } }, required: ['action'] },
    cmd: (a) => { let c = `epic ${a.action}`; if (a.id) c += ` ${a.id}`; if (a.title) c += ` --title ${escapeArg(a.title)}`; if (a.childId) c += ` ${a.childId}`; return c; }
  },
  beads_swarm: {
    description: 'Swarm management for structured epics (bd swarm)',
    category: 'planning',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Swarm action' }, id: { type: 'string', description: 'Swarm ID' } } },
    cmd: (a) => { let c = `swarm ${a.action || ''}`; if (a.id) c += ` ${a.id}`; return c; }
  },

  // === Gates ===
  beads_gate: {
    description: 'Manage async coordination gates (bd gate)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'list', 'open', 'close', 'wait'], description: 'Action' }, id: { type: 'string', description: 'Issue ID' }, gate: { type: 'string', description: 'Gate name' } }, required: ['action'] },
    cmd: (a) => { let c = `gate ${a.action}`; if (a.id) c += ` ${a.id}`; if (a.gate) c += ` ${a.gate}`; return c; }
  },
  beads_merge_slot: {
    description: 'Manage merge-slot gates (bd merge-slot)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Action' }, id: { type: 'string', description: 'Issue ID' } } },
    cmd: (a) => { let c = `merge-slot ${a.action || ''}`; if (a.id) c += ` ${a.id}`; return c; }
  },

  // === Views & Reports ===
  beads_status: {
    description: 'Show issue database overview (bd status)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { json: { type: 'boolean', description: 'Output as JSON' } } },
    cmd: (a) => { let c = 'status'; if (a.json) c += ' --json'; return c; }
  },
  beads_count: {
    description: 'Count issues matching filters (bd count)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { status: { type: 'string', description: 'Filter by status' }, type: { type: 'string', description: 'Filter by type' }, label: { type: 'string', description: 'Filter by label' } } },
    cmd: (a) => { let c = 'count'; if (a.status) c += ` --status ${a.status}`; if (a.type) c += ` --type ${a.type}`; if (a.label) c += ` --label ${a.label}`; return c; }
  },
  beads_stale: {
    description: 'Show stale issues (bd stale)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Days threshold' }, json: { type: 'boolean', description: 'Output as JSON' } } },
    cmd: (a) => { let c = 'stale'; if (a.days) c += ` --days ${a.days}`; if (a.json) c += ' --json'; return c; }
  },
  beads_types: {
    description: 'List valid issue types (bd types)',
    category: 'reports',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'types'
  },
  beads_lint: {
    description: 'Check issues for missing template sections (bd lint)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID (optional, checks all if omitted)' } } },
    cmd: (a) => { let c = 'lint'; if (a.id) c += ` ${a.id}`; return c; }
  },
  beads_todo: {
    description: 'Manage TODO items (bd todo)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'complete', 'remove'], description: 'Action' }, id: { type: 'string', description: 'Issue ID' }, text: { type: 'string', description: 'TODO text' } } },
    cmd: (a) => { let c = `todo ${a.action || 'list'}`; if (a.id) c += ` ${a.id}`; if (a.text) c += ` ${escapeArg(a.text)}`; return c; }
  },
  beads_ready: {
    description: 'Show ready work - open with no blockers (bd ready)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { json: { type: 'boolean', description: 'Output as JSON' } } },
    cmd: (a) => { let c = 'ready'; if (a.json) c += ' --json'; return c; }
  },
  beads_blocked: {
    description: 'Show blocked issues (bd blocked)',
    category: 'reports',
    inputSchema: { type: 'object', properties: { json: { type: 'boolean', description: 'Output as JSON' } } },
    cmd: (a) => { let c = 'blocked'; if (a.json) c += ' --json'; return c; }
  },
  beads_orphans: {
    description: 'Identify orphaned issues (bd orphans)',
    category: 'reports',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'orphans'
  },

  // === Duplicates ===
  beads_duplicate: {
    description: 'Mark issue as duplicate (bd duplicate)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue to mark as duplicate' }, original: { type: 'string', description: 'Original issue ID' } }, required: ['id', 'original'] },
    cmd: (a) => `duplicate ${a.id} ${a.original}`
  },
  beads_duplicates: {
    description: 'Find duplicate issues (bd duplicates)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { merge: { type: 'boolean', description: 'Merge duplicates found' } } },
    cmd: (a) => { let c = 'duplicates'; if (a.merge) c += ' --merge'; return c; }
  },
  beads_find_duplicates: {
    description: 'Find semantically similar issues (bd find-duplicates)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID to check' }, threshold: { type: 'number', description: 'Similarity threshold' } } },
    cmd: (a) => { let c = 'find-duplicates'; if (a.id) c += ` ${a.id}`; if (a.threshold) c += ` --threshold ${a.threshold}`; return c; }
  },
  beads_supersede: {
    description: 'Mark issue as superseded (bd supersede)',
    category: 'issues',
    inputSchema: { type: 'object', properties: { old: { type: 'string', description: 'Old issue ID' }, new: { type: 'string', description: 'New issue ID' } }, required: ['old', 'new'] },
    cmd: (a) => `supersede ${a.old} ${a.new}`
  },

  // === Movement ===
  beads_move: {
    description: 'Move issue to different rig (bd move)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, rig: { type: 'string', description: 'Target rig' } }, required: ['id', 'rig'] },
    cmd: (a) => `move ${a.id} ${a.rig}`
  },
  beads_refile: {
    description: 'Refile issue to different rig (bd refile)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' }, rig: { type: 'string', description: 'Target rig' } }, required: ['id', 'rig'] },
    cmd: (a) => `refile ${a.id} ${a.rig}`
  },
  beads_promote: {
    description: 'Promote wisp to permanent bead (bd promote)',
    category: 'organization',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Wisp ID' } }, required: ['id'] },
    cmd: (a) => `promote ${a.id}`
  },

  // === Sync & Data ===
  beads_backup: {
    description: 'Backup beads database (bd backup)',
    category: 'data',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Backup path' } } },
    cmd: (a) => { let c = 'backup'; if (a.path) c += ` ${a.path}`; return c; }
  },
  beads_restore: {
    description: 'Restore from backup (bd restore)',
    category: 'data',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Backup path' } }, required: ['path'] },
    cmd: (a) => `restore ${a.path}`
  },
  beads_export: {
    description: 'Export issues to JSONL (bd export)',
    category: 'data',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Export file path' }, query: { type: 'string', description: 'Filter query' } } },
    cmd: (a) => { let c = 'export'; if (a.path) c += ` ${a.path}`; if (a.query) c += ` --query '${a.query}'`; return c; }
  },
  beads_import: {
    description: 'Import issues from JSONL (bd import)',
    category: 'data',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Import file path' } }, required: ['path'] },
    cmd: (a) => `import ${a.path}`
  },

  // === Version Control ===
  beads_branch: {
    description: 'List or create branches (bd branch)',
    category: 'version-control',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Branch name (creates if specified)' } } },
    cmd: (a) => { let c = 'branch'; if (a.name) c += ` ${a.name}`; return c; }
  },
  beads_diff: {
    description: 'Show changes between commits/branches (bd diff)',
    category: 'version-control',
    inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'From ref' }, to: { type: 'string', description: 'To ref' } } },
    cmd: (a) => { let c = 'diff'; if (a.from) c += ` ${a.from}`; if (a.to) c += ` ${a.to}`; return c; }
  },
  beads_history: {
    description: 'Show version history for issue (bd history)',
    category: 'version-control',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue ID' } }, required: ['id'] },
    cmd: (a) => `history ${a.id}`
  },
  beads_vc: {
    description: 'Version control operations (bd vc)',
    category: 'version-control',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'VC action' } } },
    cmd: (a) => `vc ${a.action || ''}`
  },

  // === Setup & Config ===
  beads_init: {
    description: 'Initialize beads database (bd init)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Database path' }, dolt: { type: 'boolean', description: 'Use Dolt backend' } } },
    cmd: (a) => { let c = 'init'; if (a.path) c += ` ${a.path}`; if (a.dolt) c += ' --dolt'; return c; }
  },
  beads_config: {
    description: 'Manage configuration (bd config)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Config key' }, value: { type: 'string', description: 'Config value' }, list: { type: 'boolean', description: 'List all config' } } },
    cmd: (a) => { if (a.list) return 'config --list'; if (a.key && a.value) return `config ${a.key} ${a.value}`; if (a.key) return `config ${a.key}`; return 'config --list'; }
  },
  beads_context: {
    description: 'Manage context (bd context)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Context action' }, key: { type: 'string', description: 'Context key' } } },
    cmd: (a) => { let c = `context ${a.action || 'show'}`; if (a.key) c += ` ${a.key}`; return c; }
  },
  beads_info: {
    description: 'Show system info (bd info)',
    category: 'setup',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'info'
  },

  // === Hooks & Automation ===
  beads_hooks: {
    description: 'Manage hooks (bd hooks)',
    category: 'automation',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'enable', 'disable', 'run'], description: 'Action' }, hook: { type: 'string', description: 'Hook name' } } },
    cmd: (a) => { let c = `hooks ${a.action || 'list'}`; if (a.hook) c += ` ${a.hook}`; return c; }
  },
  beads_formula: {
    description: 'Manage workflow formulas (bd formula)',
    category: 'automation',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Formula action' }, name: { type: 'string', description: 'Formula name' } } },
    cmd: (a) => { let c = `formula ${a.action || 'list'}`; if (a.name) c += ` ${a.name}`; return c; }
  },
  beads_cook: {
    description: 'Compile formula into proto (bd cook)',
    category: 'automation',
    inputSchema: { type: 'object', properties: { formula: { type: 'string', description: 'Formula name' }, permanent: { type: 'boolean', description: 'Make permanent' } }, required: ['formula'] },
    cmd: (a) => { let c = `cook ${a.formula}`; if (a.permanent) c += ' --permanent'; return c; }
  },

  // === Agent Integration ===
  beads_agent: {
    description: 'Manage agent bead state (bd agent)',
    category: 'agents',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Agent action' }, agentId: { type: 'string', description: 'Agent ID' } } },
    cmd: (a) => { let c = `agent ${a.action || 'status'}`; if (a.agentId) c += ` ${a.agentId}`; return c; }
  },
  beads_audit: {
    description: 'Record agent interactions (bd audit)',
    category: 'agents',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Audit action' }, data: { type: 'object', description: 'Audit data' } } },
    cmd: (a) => { let c = `audit ${a.action || 'list'}`; if (a.data) c += ` '${JSON.stringify(a.data)}'`; return c; }
  },
  beads_slot: {
    description: 'Manage agent bead slots (bd slot)',
    category: 'agents',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Slot action' }, agentId: { type: 'string', description: 'Agent ID' } } },
    cmd: (a) => { let c = `slot ${a.action || 'list'}`; if (a.agentId) c += ` ${a.agentId}`; return c; }
  },

  // === Memory & Knowledge ===
  beads_memories: {
    description: 'Manage memories (bd memories)',
    category: 'knowledge',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Memory action' }, key: { type: 'string', description: 'Memory key' }, value: { type: 'string', description: 'Memory value' } } },
    cmd: (a) => { let c = `memories ${a.action || 'list'}`; if (a.key) c += ` ${a.key}`; if (a.value) c += ` ${escapeArg(a.value)}`; return c; }
  },
  beads_kv: {
    description: 'Key-value store (bd kv)',
    category: 'knowledge',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set', 'delete', 'list'], description: 'Action' }, key: { type: 'string', description: 'Key' }, value: { type: 'string', description: 'Value' } } },
    cmd: (a) => { let c = `kv ${a.action}`; if (a.key) c += ` ${a.key}`; if (a.value) c += ` ${escapeArg(a.value)}`; return c; }
  },

  // === Federation ===
  beads_federation: {
    description: 'Manage P2P federation (bd federation)',
    category: 'federation',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Federation action' }, peer: { type: 'string', description: 'Peer address' } } },
    cmd: (a) => { let c = `federation ${a.action || 'status'}`; if (a.peer) c += ` ${a.peer}`; return c; }
  },

  // === Integrations ===
  beads_github: {
    description: 'GitHub integration (bd github)',
    category: 'integrations',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'GitHub action' } } },
    cmd: (a) => `github ${a.action || 'status'}`
  },
  beads_gitlab: {
    description: 'GitLab integration (bd gitlab)',
    category: 'integrations',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'GitLab action' } } },
    cmd: (a) => `gitlab ${a.action || 'status'}`
  },
  beads_jira: {
    description: 'Jira integration (bd jira)',
    category: 'integrations',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Jira action' } } },
    cmd: (a) => `jira ${a.action || 'status'}`
  },
  beads_linear: {
    description: 'Linear integration (bd linear)',
    category: 'integrations',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Linear action' } } },
    cmd: (a) => `linear ${a.action || 'status'}`
  },

  // === Database Operations ===
  beads_dolt: {
    description: 'Dolt operations (bd dolt)',
    category: 'database',
    inputSchema: { type: 'object', properties: { args: { type: 'string', description: 'Dolt command arguments' } } },
    cmd: (a) => `dolt ${a.args || ''}`
  },
  beads_sql: {
    description: 'Execute raw SQL (bd sql)',
    category: 'database',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'SQL query' } }, required: ['query'] },
    cmd: (a) => `sql "${a.query.replace(/"/g, '\\"')}"`
  },

  // === Admin ===
  beads_admin: {
    description: 'Administrative commands (bd admin)',
    category: 'admin',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Admin action' } } },
    cmd: (a) => `admin ${a.action || 'status'}`
  },
  beads_forget: {
    description: 'Remove issues from working set (bd forget)',
    category: 'admin',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' } }, required: ['ids'] },
    cmd: (a) => `forget ${Array.isArray(a.ids) ? a.ids.join(' ') : a.ids}`
  },
  beads_gc: {
    description: 'Garbage collect (bd gc)',
    category: 'admin',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'gc'
  },
  beads_purge: {
    description: 'Delete closed ephemeral beads (bd purge)',
    category: 'admin',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'purge'
  },

  // === Utility ===
  beads_completion: {
    description: 'Generate shell completion (bd completion)',
    category: 'utility',
    inputSchema: { type: 'object', properties: { shell: { type: 'string', enum: ['bash', 'zsh', 'fish'], description: 'Shell type' } }, required: ['shell'] },
    cmd: (a) => `completion ${a.shell}`
  },
  beads_version: {
    description: 'Print version (bd version)',
    category: 'utility',
    inputSchema: { type: 'object', properties: {} },
    cmd: () => 'version'
  },
  beads_help: {
    description: 'Get help on any command (bd help)',
    category: 'utility',
    inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Command to get help for' } } },
    cmd: (a) => { let c = 'help'; if (a.command) c += ` ${a.command}`; return c; }
  },

  // === Additional Commands ===
  beads_defer: {
    description: 'Defer issues for later (bd defer)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' }, until: { type: 'string', description: 'Defer until date/expression' } }, required: ['ids'] },
    cmd: (a) => { const ids = Array.isArray(a.ids) ? a.ids.join(' ') : a.ids; let c = `defer ${ids}`; if (a.until) c += ` --until ${a.until}`; return c; }
  },
  beads_undefer: {
    description: 'Undefer issues (bd undefer)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' } }, required: ['ids'] },
    cmd: (a) => `undefer ${Array.isArray(a.ids) ? a.ids.join(' ') : a.ids}`
  },
  beads_rename: {
    description: 'Rename issue ID (bd rename)',
    category: 'admin',
    inputSchema: { type: 'object', properties: { oldId: { type: 'string', description: 'Current ID' }, newId: { type: 'string', description: 'New ID' } }, required: ['oldId', 'newId'] },
    cmd: (a) => `rename ${a.oldId} ${a.newId}`
  },
  beads_ship: {
    description: 'Publish capability (bd ship)',
    category: 'workflow',
    inputSchema: { type: 'object', properties: { capability: { type: 'string', description: 'Capability to ship' } } },
    cmd: (a) => `ship ${a.capability || ''}`
  },
  beads_human: {
    description: 'Human interaction commands (bd human)',
    category: 'collaboration',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Human action' } } },
    cmd: (a) => `human ${a.action || 'status'}`
  },
  beads_onboard: {
    description: 'Onboarding commands (bd onboard)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Onboard action' } } },
    cmd: (a) => `onboard ${a.action || 'start'}`
  },
  beads_prime: {
    description: 'Prime beads (bd prime)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { template: { type: 'string', description: 'Prime template' } } },
    cmd: (a) => { let c = 'prime'; if (a.template) c += ` ${a.template}`; return c; }
  },
  beads_bootstrap: {
    description: 'Bootstrap beads (bd bootstrap)',
    category: 'setup',
    inputSchema: { type: 'object', properties: { template: { type: 'string', description: 'Bootstrap template' } } },
    cmd: (a) => { let c = 'bootstrap'; if (a.template) c += ` ${a.template}`; return c; }
  }
};

// ============ ROUTER TOOLS ============

const ROUTER_TOOLS = [
  {
    name: 'bd_discover',
    description: `Discover available beads commands. Returns list of commands matching query.
Categories: issues, collaboration, organization, workflow, planning, reports, data, setup, utility, integrations, knowledge, visualization, version-control, agents, federation, database, admin, automation

Usage:
- bd_discover() → list all commands
- bd_discover({query: "create"}) → find commands containing "create"
- bd_discover({category: "issues"}) → list commands in category
- bd_discover({detailed: true}) → include descriptions`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches command name and description)' },
        category: { type: 'string', description: 'Filter by category' },
        detailed: { type: 'boolean', description: 'Include descriptions in output' }
      }
    }
  },
  {
    name: 'bd_info',
    description: `Get full JSON schema for a specific beads command.
Call this BEFORE using bd_exec to understand required/optional parameters.

Example: bd_info({command: "beads_create"}) → returns full schema with all parameters`,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command name (e.g., "beads_create", "beads_list")' }
      },
      required: ['command']
    }
  },
  {
    name: 'bd_exec',
    description: `Execute a beads command with validated arguments.
First call bd_info(command) to get the schema, then call bd_exec with your args.

Example:
1. bd_info({command: "beads_create"}) → see schema
2. bd_exec({command: "beads_create", args: {title: "My Issue", type: "feature"}})`,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command name to execute' },
        args: { type: 'object', description: 'Arguments for the command (check bd_info for schema)' }
      },
      required: ['command']
    }
  }
];

// ============ HANDLERS ============

function handleDiscover(args) {
  let results = Object.entries(TOOL_REGISTRY);

  if (args.category) {
    results = results.filter(([_, cmd]) => cmd.category === args.category);
  }

  if (args.query) {
    const q = args.query.toLowerCase();
    results = results.filter(([name, cmd]) =>
      name.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );
  }

  if (args.detailed) {
    return results.map(([name, cmd]) => ({
      command: name,
      description: cmd.description,
      category: cmd.category,
      required: cmd.inputSchema.required || []
    }));
  }

  return {
    total: results.length,
    commands: results.map(([name, cmd]) => ({ name, category: cmd.category })),
    categories: [...new Set(results.map(([_, cmd]) => cmd.category))]
  };
}

function handleInfo(args) {
  const cmd = TOOL_REGISTRY[args.command];
  if (!cmd) {
    return {
      error: `Unknown command: ${args.command}`,
      hint: 'Use bd_discover to find available commands',
      available: Object.keys(TOOL_REGISTRY)
    };
  }

  return {
    command: args.command,
    description: cmd.description,
    category: cmd.category,
    schema: cmd.inputSchema,
    usage: `bd_exec({command: "${args.command}", args: {...}})`
  };
}

async function handleExec(args, client) {
  const cmdDef = TOOL_REGISTRY[args.command];
  if (!cmdDef) {
    return {
      error: `Unknown command: ${args.command}`,
      hint: 'Use bd_discover to find available commands'
    };
  }

  const cmdString = cmdDef.cmd(args.args || {});
  const result = await client.run(cmdString);

  return {
    command: args.command,
    executed: `bd ${cmdString}`,
    success: result.success,
    output: result.stdout || result.stderr,
    error: result.success ? null : result.stderr
  };
}

// ============ MCP SERVER ============

const server = new Server(
  { name: 'beads-router-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ROUTER_TOOLS
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = new BeadsClient(process.env.BEADS_CWD || process.cwd());

  try {
    let result;

    switch (name) {
      case 'bd_discover':
        result = handleDiscover(args || {});
        break;
      case 'bd_info':
        result = handleInfo(args || {});
        break;
      case 'bd_exec':
        result = await handleExec(args || {}, client);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }

    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }],
      isError: !!result.error
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// ============ MAIN ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Beads Router MCP: ${ROUTER_TOOLS.length} tools exposing ${Object.keys(TOOL_REGISTRY).length} commands`);
}

main().catch(console.error);
