#!/usr/bin/env node
/**
 * Beads MCP Server - Complete Implementation
 * Exposes ALL beads CLI commands as MCP tools
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

// Beads CLI wrapper
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

  async runJson(args) {
    const result = await this.run(`${args} --json 2>/dev/null || bd ${args}`);
    if (result.stdout) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        // Not JSON, return raw
      }
    }
    return result;
  }
}

// ============ TOOL DEFINITIONS ============

const toolDefinitions = [
  // === Working With Issues ===
  {
    name: 'beads_create',
    description: 'Create a new issue (bd create)',
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
    }
  },
  {
    name: 'beads_list',
    description: 'List issues (bd list)',
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
    }
  },
  {
    name: 'beads_show',
    description: 'Show issue details (bd show)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        json: { type: 'boolean', description: 'Output as JSON' }
      },
      required: ['id']
    }
  },
  {
    name: 'beads_update',
    description: 'Update an issue (bd update)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        title: { type: 'string', description: 'New title' },
        body: { type: 'string', description: 'New body' },
        type: { type: 'string', description: 'New type' },
        addLabel: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
        removeLabel: { type: 'array', items: { type: 'string' }, description: 'Labels to remove' }
      },
      required: ['id']
    }
  },
  {
    name: 'beads_close',
    description: 'Close one or more issues (bd close)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to close' },
        reason: { type: 'string', description: 'Close reason' },
        comment: { type: 'string', description: 'Closing comment' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_reopen',
    description: 'Reopen closed issues (bd reopen)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to reopen' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_delete',
    description: 'Delete issues (bd delete)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs to delete' },
        force: { type: 'boolean', description: 'Force delete without confirmation' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_edit',
    description: 'Edit an issue field in $EDITOR (bd edit)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        field: { type: 'string', description: 'Field to edit (title, body, type)' }
      },
      required: ['id']
    }
  },
  {
    name: 'beads_search',
    description: 'Search issues by text (bd search)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        json: { type: 'boolean', description: 'Output as JSON' }
      },
      required: ['query']
    }
  },
  {
    name: 'beads_query',
    description: 'Query issues using beads query language (bd query)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query expression' },
        json: { type: 'boolean', description: 'Output as JSON' }
      },
      required: ['query']
    }
  },
  {
    name: 'beads_q',
    description: 'Quick capture - create issue and output only ID (bd q)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Issue title' },
        type: { type: 'string', description: 'Issue type' }
      },
      required: ['title']
    }
  },
  {
    name: 'beads_create_form',
    description: 'Create issue using interactive form (bd create-form)',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Form template to use' }
      }
    }
  },

  // === Comments ===
  {
    name: 'beads_comments',
    description: 'View or manage comments (bd comments)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        add: { type: 'string', description: 'Add comment text' },
        edit: { type: 'string', description: 'Comment ID to edit' },
        delete: { type: 'string', description: 'Comment ID to delete' }
      },
      required: ['id']
    }
  },

  // === Labels ===
  {
    name: 'beads_label',
    description: 'Manage issue labels (bd label)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        add: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
        remove: { type: 'array', items: { type: 'string' }, description: 'Labels to remove' },
        set: { type: 'array', items: { type: 'string' }, description: 'Set labels (replace all)' }
      },
      required: ['id']
    }
  },

  // === State Management ===
  {
    name: 'beads_set_state',
    description: 'Set operational state (bd set-state)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        state: { type: 'string', description: 'State dimension (e.g., "status:in-progress")' }
      },
      required: ['id', 'state']
    }
  },
  {
    name: 'beads_state',
    description: 'Query current state dimension value (bd state)',
    inputSchema: {
      type: 'object',
      properties: {
        dimension: { type: 'string', description: 'State dimension to query' }
      }
    }
  },

  // === Dependencies ===
  {
    name: 'beads_dep',
    description: 'Manage dependencies (bd dep)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'Action to perform' },
        id: { type: 'string', description: 'Issue ID' },
        dependsOn: { type: 'string', description: 'Issue ID this depends on' }
      },
      required: ['action']
    }
  },
  {
    name: 'beads_children',
    description: 'List child issues of a parent (bd children)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Parent issue ID' },
        json: { type: 'boolean', description: 'Output as JSON' }
      },
      required: ['id']
    }
  },
  {
    name: 'beads_graph',
    description: 'Display dependency graph (bd graph)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Root issue ID' },
        format: { type: 'string', enum: ['text', 'dot', 'mermaid'], description: 'Output format' }
      }
    }
  },

  // === Epics ===
  {
    name: 'beads_epic',
    description: 'Epic management commands (bd epic)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'show', 'add-child', 'remove-child'], description: 'Action' },
        id: { type: 'string', description: 'Epic ID' },
        title: { type: 'string', description: 'Epic title' },
        childId: { type: 'string', description: 'Child issue ID' }
      },
      required: ['action']
    }
  },
  {
    name: 'beads_swarm',
    description: 'Swarm management for structured epics (bd swarm)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Swarm action' },
        id: { type: 'string', description: 'Swarm ID' }
      }
    }
  },

  // === Gates ===
  {
    name: 'beads_gate',
    description: 'Manage async coordination gates (bd gate)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'open', 'close', 'wait'], description: 'Action' },
        id: { type: 'string', description: 'Issue ID' },
        gate: { type: 'string', description: 'Gate name' }
      },
      required: ['action']
    }
  },
  {
    name: 'beads_merge_slot',
    description: 'Manage merge-slot gates (bd merge-slot)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action' },
        id: { type: 'string', description: 'Issue ID' }
      }
    }
  },

  // === Views & Reports ===
  {
    name: 'beads_status',
    description: 'Show issue database overview (bd status)',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'boolean', description: 'Output as JSON' }
      }
    }
  },
  {
    name: 'beads_count',
    description: 'Count issues matching filters (bd count)',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        type: { type: 'string', description: 'Filter by type' },
        label: { type: 'string', description: 'Filter by label' }
      }
    }
  },
  {
    name: 'beads_stale',
    description: 'Show stale issues (bd stale)',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days threshold' },
        json: { type: 'boolean', description: 'Output as JSON' }
      }
    }
  },
  {
    name: 'beads_types',
    description: 'List valid issue types (bd types)',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'beads_lint',
    description: 'Check issues for missing template sections (bd lint)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID (optional, checks all if omitted)' }
      }
    }
  },
  {
    name: 'beads_todo',
    description: 'Manage TODO items (bd todo)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'complete', 'remove'], description: 'Action' },
        id: { type: 'string', description: 'Issue ID' },
        text: { type: 'string', description: 'TODO text' }
      }
    }
  },
  {
    name: 'beads_ready',
    description: 'Show ready work - open with no blockers (bd ready)',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'boolean', description: 'Output as JSON' }
      }
    }
  },
  {
    name: 'beads_blocked',
    description: 'Show blocked issues (bd blocked)',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'boolean', description: 'Output as JSON' }
      }
    }
  },
  {
    name: 'beads_orphans',
    description: 'Identify orphaned issues (bd orphans)',
    inputSchema: { type: 'object', properties: {} }
  },

  // === Duplicates ===
  {
    name: 'beads_duplicate',
    description: 'Mark issue as duplicate (bd duplicate)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue to mark as duplicate' },
        original: { type: 'string', description: 'Original issue ID' }
      },
      required: ['id', 'original']
    }
  },
  {
    name: 'beads_duplicates',
    description: 'Find duplicate issues (bd duplicates)',
    inputSchema: {
      type: 'object',
      properties: {
        merge: { type: 'boolean', description: 'Merge duplicates found' }
      }
    }
  },
  {
    name: 'beads_find_duplicates',
    description: 'Find semantically similar issues (bd find-duplicates)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID to check' },
        threshold: { type: 'number', description: 'Similarity threshold' }
      }
    }
  },
  {
    name: 'beads_supersede',
    description: 'Mark issue as superseded (bd supersede)',
    inputSchema: {
      type: 'object',
      properties: {
        old: { type: 'string', description: 'Old issue ID' },
        new: { type: 'string', description: 'New issue ID' }
      },
      required: ['old', 'new']
    }
  },

  // === Movement ===
  {
    name: 'beads_move',
    description: 'Move issue to different rig (bd move)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        rig: { type: 'string', description: 'Target rig' }
      },
      required: ['id', 'rig']
    }
  },
  {
    name: 'beads_refile',
    description: 'Refile issue to different rig (bd refile)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' },
        rig: { type: 'string', description: 'Target rig' }
      },
      required: ['id', 'rig']
    }
  },
  {
    name: 'beads_promote',
    description: 'Promote wisp to permanent bead (bd promote)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Wisp ID' }
      },
      required: ['id']
    }
  },

  // === Sync & Data ===
  {
    name: 'beads_backup',
    description: 'Backup beads database (bd backup)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Backup path' }
      }
    }
  },
  {
    name: 'beads_restore',
    description: 'Restore from backup (bd restore)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Backup path' }
      },
      required: ['path']
    }
  },
  {
    name: 'beads_export',
    description: 'Export issues to JSONL (bd export)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Export file path' },
        query: { type: 'string', description: 'Filter query' }
      }
    }
  },
  {
    name: 'beads_import',
    description: 'Import issues from JSONL (bd import)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Import file path' }
      },
      required: ['path']
    }
  },

  // === Version Control ===
  {
    name: 'beads_branch',
    description: 'List or create branches (bd branch)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Branch name (creates if specified)' }
      }
    }
  },
  {
    name: 'beads_diff',
    description: 'Show changes between commits/branches (bd diff)',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'From ref' },
        to: { type: 'string', description: 'To ref' }
      }
    }
  },
  {
    name: 'beads_history',
    description: 'Show version history for issue (bd history)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'beads_vc',
    description: 'Version control operations (bd vc)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'VC action' }
      }
    }
  },

  // === Setup & Config ===
  {
    name: 'beads_init',
    description: 'Initialize beads database (bd init)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Database path' },
        dolt: { type: 'boolean', description: 'Use Dolt backend' }
      }
    }
  },
  {
    name: 'beads_config',
    description: 'Manage configuration (bd config)',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Config key' },
        value: { type: 'string', description: 'Config value' },
        list: { type: 'boolean', description: 'List all config' }
      }
    }
  },
  {
    name: 'beads_context',
    description: 'Manage context (bd context)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Context action' },
        key: { type: 'string', description: 'Context key' }
      }
    }
  },
  {
    name: 'beads_info',
    description: 'Show system info (bd info)',
    inputSchema: { type: 'object', properties: {} }
  },

  // === Hooks & Automation ===
  {
    name: 'beads_hooks',
    description: 'Manage hooks (bd hooks)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'enable', 'disable', 'run'], description: 'Action' },
        hook: { type: 'string', description: 'Hook name' }
      }
    }
  },
  {
    name: 'beads_formula',
    description: 'Manage workflow formulas (bd formula)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Formula action' },
        name: { type: 'string', description: 'Formula name' }
      }
    }
  },
  {
    name: 'beads_cook',
    description: 'Compile formula into proto (bd cook)',
    inputSchema: {
      type: 'object',
      properties: {
        formula: { type: 'string', description: 'Formula name' },
        permanent: { type: 'boolean', description: 'Make permanent' }
      },
      required: ['formula']
    }
  },

  // === Agent Integration ===
  {
    name: 'beads_agent',
    description: 'Manage agent bead state (bd agent)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Agent action' },
        agentId: { type: 'string', description: 'Agent ID' }
      }
    }
  },
  {
    name: 'beads_audit',
    description: 'Record agent interactions (bd audit)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Audit action' },
        data: { type: 'object', description: 'Audit data' }
      }
    }
  },
  {
    name: 'beads_slot',
    description: 'Manage agent bead slots (bd slot)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Slot action' },
        agentId: { type: 'string', description: 'Agent ID' }
      }
    }
  },

  // === Memory & Knowledge ===
  {
    name: 'beads_memories',
    description: 'Manage memories (bd memories)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Memory action' },
        key: { type: 'string', description: 'Memory key' },
        value: { type: 'string', description: 'Memory value' }
      }
    }
  },
  {
    name: 'beads_kv',
    description: 'Key-value store (bd kv)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'delete', 'list'], description: 'Action' },
        key: { type: 'string', description: 'Key' },
        value: { type: 'string', description: 'Value' }
      }
    }
  },

  // === Federation ===
  {
    name: 'beads_federation',
    description: 'Manage P2P federation (bd federation)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Federation action' },
        peer: { type: 'string', description: 'Peer address' }
      }
    }
  },

  // === Integrations ===
  {
    name: 'beads_github',
    description: 'GitHub integration (bd github)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'GitHub action' }
      }
    }
  },
  {
    name: 'beads_gitlab',
    description: 'GitLab integration (bd gitlab)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'GitLab action' }
      }
    }
  },
  {
    name: 'beads_jira',
    description: 'Jira integration (bd jira)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Jira action' }
      }
    }
  },
  {
    name: 'beads_linear',
    description: 'Linear integration (bd linear)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Linear action' }
      }
    }
  },

  // === Database Operations ===
  {
    name: 'beads_dolt',
    description: 'Dolt operations (bd dolt)',
    inputSchema: {
      type: 'object',
      properties: {
        args: { type: 'string', description: 'Dolt command arguments' }
      }
    }
  },
  {
    name: 'beads_sql',
    description: 'Execute raw SQL (bd sql)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query' }
      },
      required: ['query']
    }
  },

  // === Admin ===
  {
    name: 'beads_admin',
    description: 'Administrative commands (bd admin)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Admin action' }
      }
    }
  },
  {
    name: 'beads_forget',
    description: 'Remove issues from working set (bd forget)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_gc',
    description: 'Garbage collect (bd gc)',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'beads_purge',
    description: 'Delete closed ephemeral beads (bd purge)',
    inputSchema: { type: 'object', properties: {} }
  },

  // === Utility ===
  {
    name: 'beads_completion',
    description: 'Generate shell completion (bd completion)',
    inputSchema: {
      type: 'object',
      properties: {
        shell: { type: 'string', enum: ['bash', 'zsh', 'fish'], description: 'Shell type' }
      },
      required: ['shell']
    }
  },
  {
    name: 'beads_version',
    description: 'Print version (bd version)',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'beads_help',
    description: 'Get help on any command (bd help)',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to get help for' }
      }
    }
  },

  // === Additional Commands ===
  {
    name: 'beads_defer',
    description: 'Defer issues for later (bd defer)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' },
        until: { type: 'string', description: 'Defer until date/expression' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_undefer',
    description: 'Undefer issues (bd undefer)',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Issue IDs' }
      },
      required: ['ids']
    }
  },
  {
    name: 'beads_rename',
    description: 'Rename issue ID (bd rename)',
    inputSchema: {
      type: 'object',
      properties: {
        oldId: { type: 'string', description: 'Current ID' },
        newId: { type: 'string', description: 'New ID' }
      },
      required: ['oldId', 'newId']
    }
  },
  {
    name: 'beads_ship',
    description: 'Publish capability (bd ship)',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string', description: 'Capability to ship' }
      }
    }
  },
  {
    name: 'beads_human',
    description: 'Human interaction commands (bd human)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Human action' }
      }
    }
  },
  {
    name: 'beads_onboard',
    description: 'Onboarding commands (bd onboard)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Onboard action' }
      }
    }
  },
  {
    name: 'beads_prime',
    description: 'Prime beads (bd prime)',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Prime template' }
      }
    }
  },
  {
    name: 'beads_bootstrap',
    description: 'Bootstrap beads (bd bootstrap)',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Bootstrap template' }
      }
    }
  }
];

// ============ TOOL HANDLERS ============

async function handleTool(name, args, client) {
  const escapeArg = (str) => `"${String(str).replace(/"/g, '\\"')}"`;

  // Map tool names to bd commands
  const toolHandlers = {
    // Working With Issues
    beads_create: async () => {
      let cmd = `create ${escapeArg(args.title)}`;
      if (args.body) cmd += ` --body ${escapeArg(args.body)}`;
      if (args.type) cmd += ` --type ${args.type}`;
      if (args.parent) cmd += ` --parent ${args.parent}`;
      if (args.labels) args.labels.forEach(l => cmd += ` --label ${escapeArg(l)}`);
      if (args.priority) cmd += ` --label priority:${args.priority}`;
      if (args.assignee) cmd += ` --assignee ${args.assignee}`;
      if (args.state) cmd += ` --state ${args.state}`;
      return client.run(cmd);
    },
    beads_list: async () => {
      let cmd = 'list';
      if (args.status) cmd += ` --status ${args.status}`;
      if (args.type) cmd += ` --type ${args.type}`;
      if (args.label) cmd += ` --label ${args.label}`;
      if (args.assignee) cmd += ` --assignee ${args.assignee}`;
      if (args.parent) cmd += ` --parent ${args.parent}`;
      if (args.limit) cmd += ` --limit ${args.limit}`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_show: async () => {
      let cmd = `show ${args.id}`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_update: async () => {
      let cmd = `update ${args.id}`;
      if (args.title) cmd += ` --title ${escapeArg(args.title)}`;
      if (args.body) cmd += ` --body ${escapeArg(args.body)}`;
      if (args.type) cmd += ` --type ${args.type}`;
      if (args.addLabel) args.addLabel.forEach(l => cmd += ` --add-label ${escapeArg(l)}`);
      if (args.removeLabel) args.removeLabel.forEach(l => cmd += ` --remove-label ${escapeArg(l)}`);
      return client.run(cmd);
    },
    beads_close: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      let cmd = `close ${ids}`;
      if (args.reason) cmd += ` --reason ${escapeArg(args.reason)}`;
      if (args.comment) cmd += ` --comment ${escapeArg(args.comment)}`;
      return client.run(cmd);
    },
    beads_reopen: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      return client.run(`reopen ${ids}`);
    },
    beads_delete: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      let cmd = `delete ${ids}`;
      if (args.force) cmd += ' --force';
      return client.run(cmd);
    },
    beads_edit: async () => {
      let cmd = `edit ${args.id}`;
      if (args.field) cmd += ` --field ${args.field}`;
      return client.run(cmd);
    },
    beads_search: async () => {
      let cmd = `search ${escapeArg(args.query)}`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_query: async () => {
      let cmd = `query '${args.query}'`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_q: async () => {
      let cmd = `q ${escapeArg(args.title)}`;
      if (args.type) cmd += ` --type ${args.type}`;
      return client.run(cmd);
    },
    beads_create_form: async () => {
      let cmd = 'create-form';
      if (args.template) cmd += ` --template ${args.template}`;
      return client.run(cmd);
    },

    // Comments
    beads_comments: async () => {
      let cmd = `comments ${args.id}`;
      if (args.add) cmd += ` --add ${escapeArg(args.add)}`;
      if (args.edit) cmd += ` --edit ${args.edit}`;
      if (args.delete) cmd += ` --delete ${args.delete}`;
      return client.run(cmd);
    },

    // Labels
    beads_label: async () => {
      let cmd = `label ${args.id}`;
      if (args.add) args.add.forEach(l => cmd += ` --add ${escapeArg(l)}`);
      if (args.remove) args.remove.forEach(l => cmd += ` --remove ${escapeArg(l)}`);
      if (args.set) args.set.forEach(l => cmd += ` --set ${escapeArg(l)}`);
      return client.run(cmd);
    },

    // State
    beads_set_state: async () => `set-state ${args.id} ${args.state}`,
    beads_state: async () => {
      let cmd = 'state';
      if (args.dimension) cmd += ` ${args.dimension}`;
      return client.run(cmd);
    },

    // Dependencies
    beads_dep: async () => {
      let cmd = `dep ${args.action}`;
      if (args.id) cmd += ` ${args.id}`;
      if (args.dependsOn) cmd += ` ${args.dependsOn}`;
      return client.run(cmd);
    },
    beads_children: async () => {
      let cmd = `children ${args.id}`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_graph: async () => {
      let cmd = 'graph';
      if (args.id) cmd += ` ${args.id}`;
      if (args.format) cmd += ` --format ${args.format}`;
      return client.run(cmd);
    },

    // Epics
    beads_epic: async () => {
      let cmd = `epic ${args.action}`;
      if (args.id) cmd += ` ${args.id}`;
      if (args.title) cmd += ` --title ${escapeArg(args.title)}`;
      if (args.childId) cmd += ` ${args.childId}`;
      return client.run(cmd);
    },
    beads_swarm: async () => {
      let cmd = `swarm ${args.action || ''}`;
      if (args.id) cmd += ` ${args.id}`;
      return client.run(cmd);
    },

    // Gates
    beads_gate: async () => {
      let cmd = `gate ${args.action}`;
      if (args.id) cmd += ` ${args.id}`;
      if (args.gate) cmd += ` ${args.gate}`;
      return client.run(cmd);
    },
    beads_merge_slot: async () => {
      let cmd = `merge-slot ${args.action || ''}`;
      if (args.id) cmd += ` ${args.id}`;
      return client.run(cmd);
    },

    // Views & Reports
    beads_status: async () => {
      let cmd = 'status';
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_count: async () => {
      let cmd = 'count';
      if (args.status) cmd += ` --status ${args.status}`;
      if (args.type) cmd += ` --type ${args.type}`;
      if (args.label) cmd += ` --label ${args.label}`;
      return client.run(cmd);
    },
    beads_stale: async () => {
      let cmd = 'stale';
      if (args.days) cmd += ` --days ${args.days}`;
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_types: async () => client.run('types'),
    beads_lint: async () => {
      let cmd = 'lint';
      if (args.id) cmd += ` ${args.id}`;
      return client.run(cmd);
    },
    beads_todo: async () => {
      let cmd = `todo ${args.action || 'list'}`;
      if (args.id) cmd += ` ${args.id}`;
      if (args.text) cmd += ` ${escapeArg(args.text)}`;
      return client.run(cmd);
    },
    beads_ready: async () => {
      let cmd = 'ready';
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_blocked: async () => {
      let cmd = 'blocked';
      if (args.json) cmd += ' --json';
      return client.run(cmd);
    },
    beads_orphans: async () => client.run('orphans'),

    // Duplicates
    beads_duplicate: async () => `duplicate ${args.id} ${args.original}`,
    beads_duplicates: async () => {
      let cmd = 'duplicates';
      if (args.merge) cmd += ' --merge';
      return client.run(cmd);
    },
    beads_find_duplicates: async () => {
      let cmd = 'find-duplicates';
      if (args.id) cmd += ` ${args.id}`;
      if (args.threshold) cmd += ` --threshold ${args.threshold}`;
      return client.run(cmd);
    },
    beads_supersede: async () => `supersede ${args.old} ${args.new}`,

    // Movement
    beads_move: async () => `move ${args.id} ${args.rig}`,
    beads_refile: async () => `refile ${args.id} ${args.rig}`,
    beads_promote: async () => `promote ${args.id}`,

    // Sync & Data
    beads_backup: async () => {
      let cmd = 'backup';
      if (args.path) cmd += ` ${args.path}`;
      return client.run(cmd);
    },
    beads_restore: async () => `restore ${args.path}`,
    beads_export: async () => {
      let cmd = 'export';
      if (args.path) cmd += ` ${args.path}`;
      if (args.query) cmd += ` --query '${args.query}'`;
      return client.run(cmd);
    },
    beads_import: async () => `import ${args.path}`,

    // Version Control
    beads_branch: async () => {
      let cmd = 'branch';
      if (args.name) cmd += ` ${args.name}`;
      return client.run(cmd);
    },
    beads_diff: async () => {
      let cmd = 'diff';
      if (args.from) cmd += ` ${args.from}`;
      if (args.to) cmd += ` ${args.to}`;
      return client.run(cmd);
    },
    beads_history: async () => `history ${args.id}`,
    beads_vc: async () => `vc ${args.action || ''}`,

    // Setup & Config
    beads_init: async () => {
      let cmd = 'init';
      if (args.path) cmd += ` ${args.path}`;
      if (args.dolt) cmd += ' --dolt';
      return client.run(cmd);
    },
    beads_config: async () => {
      if (args.list) return client.run('config --list');
      if (args.key && args.value) return client.run(`config ${args.key} ${args.value}`);
      if (args.key) return client.run(`config ${args.key}`);
      return client.run('config --list');
    },
    beads_context: async () => {
      let cmd = `context ${args.action || 'show'}`;
      if (args.key) cmd += ` ${args.key}`;
      return client.run(cmd);
    },
    beads_info: async () => client.run('info'),

    // Hooks & Automation
    beads_hooks: async () => {
      let cmd = `hooks ${args.action || 'list'}`;
      if (args.hook) cmd += ` ${args.hook}`;
      return client.run(cmd);
    },
    beads_formula: async () => {
      let cmd = `formula ${args.action || 'list'}`;
      if (args.name) cmd += ` ${args.name}`;
      return client.run(cmd);
    },
    beads_cook: async () => {
      let cmd = `cook ${args.formula}`;
      if (args.permanent) cmd += ' --permanent';
      return client.run(cmd);
    },

    // Agent Integration
    beads_agent: async () => {
      let cmd = `agent ${args.action || 'status'}`;
      if (args.agentId) cmd += ` ${args.agentId}`;
      return client.run(cmd);
    },
    beads_audit: async () => {
      let cmd = `audit ${args.action || 'list'}`;
      if (args.data) cmd += ` '${JSON.stringify(args.data)}'`;
      return client.run(cmd);
    },
    beads_slot: async () => {
      let cmd = `slot ${args.action || 'list'}`;
      if (args.agentId) cmd += ` ${args.agentId}`;
      return client.run(cmd);
    },

    // Memory & Knowledge
    beads_memories: async () => {
      let cmd = `memories ${args.action || 'list'}`;
      if (args.key) cmd += ` ${args.key}`;
      if (args.value) cmd += ` ${escapeArg(args.value)}`;
      return client.run(cmd);
    },
    beads_kv: async () => {
      let cmd = `kv ${args.action}`;
      if (args.key) cmd += ` ${args.key}`;
      if (args.value) cmd += ` ${escapeArg(args.value)}`;
      return client.run(cmd);
    },

    // Federation
    beads_federation: async () => {
      let cmd = `federation ${args.action || 'status'}`;
      if (args.peer) cmd += ` ${args.peer}`;
      return client.run(cmd);
    },

    // Integrations
    beads_github: async () => `github ${args.action || 'status'}`,
    beads_gitlab: async () => `gitlab ${args.action || 'status'}`,
    beads_jira: async () => `jira ${args.action || 'status'}`,
    beads_linear: async () => `linear ${args.action || 'status'}`,

    // Database Operations
    beads_dolt: async () => `dolt ${args.args || ''}`,
    beads_sql: async () => `sql "${args.query.replace(/"/g, '\\"')}"`,

    // Admin
    beads_admin: async () => `admin ${args.action || 'status'}`,
    beads_forget: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      return client.run(`forget ${ids}`);
    },
    beads_gc: async () => client.run('gc'),
    beads_purge: async () => client.run('purge'),

    // Utility
    beads_completion: async () => `completion ${args.shell}`,
    beads_version: async () => client.run('version'),
    beads_help: async () => {
      let cmd = 'help';
      if (args.command) cmd += ` ${args.command}`;
      return client.run(cmd);
    },

    // Additional
    beads_defer: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      let cmd = `defer ${ids}`;
      if (args.until) cmd += ` --until ${args.until}`;
      return client.run(cmd);
    },
    beads_undefer: async () => {
      const ids = Array.isArray(args.ids) ? args.ids.join(' ') : args.ids;
      return client.run(`undefer ${ids}`);
    },
    beads_rename: async () => `rename ${args.oldId} ${args.newId}`,
    beads_ship: async () => `ship ${args.capability || ''}`,
    beads_human: async () => `human ${args.action || 'status'}`,
    beads_onboard: async () => `onboard ${args.action || 'start'}`,
    beads_prime: async () => {
      let cmd = 'prime';
      if (args.template) cmd += ` ${args.template}`;
      return client.run(cmd);
    },
    beads_bootstrap: async () => {
      let cmd = 'bootstrap';
      if (args.template) cmd += ` ${args.template}`;
      return client.run(cmd);
    }
  };

  const handler = toolHandlers[name];
  if (!handler) {
    return { success: false, stdout: '', stderr: `Unknown tool: ${name}` };
  }

  const result = await handler();
  // If handler returned a string, run it
  if (typeof result === 'string') {
    return client.run(result);
  }
  return result;
}

// ============ MCP SERVER SETUP ============

const server = new Server(
  { name: 'beads-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = new BeadsClient(process.env.BEADS_CWD || process.cwd());

  try {
    const result = await handleTool(name, args || {}, client);

    return {
      content: [{
        type: 'text',
        text: result.success !== false
          ? (result.stdout || result.stderr || 'OK')
          : `Error: ${result.stderr || result.stdout || 'Unknown error'}`
      }],
      isError: result.success === false
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Beads MCP server running on stdio');
}

main().catch(console.error);
