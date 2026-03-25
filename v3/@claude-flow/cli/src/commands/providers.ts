/**
 * V3 CLI Providers Command
 * Manage AI providers, models, and configurations
 *
 * Created with <3 by ruv.io
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Provider Registry - single source of truth
// ============================================

interface ProviderEntry {
  name: string;
  displayName: string;
  envKey: string;
  apiEndpoint: string;
  /** Path appended to apiEndpoint for health checks */
  healthPath: string;
  /** How the auth header is sent */
  authStyle: 'bearer' | 'x-api-key';
  /** Extra headers needed for the health check */
  extraHeaders?: Record<string, string>;
  defaultModel: string;
  models: ModelEntry[];
}

interface ModelEntry {
  id: string;
  capability: string;
  contextWindow: string;
  pricing: string; // "input/output per 1K tokens" or "Free"
}

const PROVIDER_REGISTRY: ProviderEntry[] = [
  {
    name: 'zai',
    displayName: 'ZAI (Zhipu)',
    envKey: 'ZAI_API_KEY',
    apiEndpoint: 'https://api.z.ai/api/coding/paas/v4',
    healthPath: '/models',
    authStyle: 'bearer',
    defaultModel: 'glm-5',
    models: [
      { id: 'glm-5',       capability: 'Chat', contextWindow: '128K', pricing: '$0.0005/$0.001' },
      { id: 'glm-4.7',     capability: 'Chat', contextWindow: '128K', pricing: '$0.0003/$0.0006' },
      { id: 'glm-5-turbo', capability: 'Chat', contextWindow: '128K', pricing: '$0.0002/$0.0004' },
      { id: 'glm-4-plus',  capability: 'Chat', contextWindow: '128K', pricing: '$0.00035/$0.0007' },
      { id: 'glm-4-flash', capability: 'Chat', contextWindow: '128K', pricing: '$0.0001/$0.0002' },
    ],
  },
  {
    name: 'minimax',
    displayName: 'MiniMax',
    envKey: 'MINIMAX_API_KEY',
    apiEndpoint: 'https://api.minimax.io/anthropic/v1',
    healthPath: '/messages',
    authStyle: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    defaultModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7',   capability: 'Chat', contextWindow: '128K', pricing: '$0.0004/$0.0008' },
      { id: 'abab6.5s-chat',  capability: 'Chat', contextWindow: '245K', pricing: '$0.0002/$0.0004' },
      { id: 'abab6.5-chat',   capability: 'Chat', contextWindow: '245K', pricing: '$0.0003/$0.0006' },
    ],
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    apiEndpoint: 'https://api.deepseek.com/anthropic/v1',
    healthPath: '/messages',
    authStyle: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    defaultModel: 'deepseek-reasoner',
    models: [
      { id: 'deepseek-reasoner', capability: 'Chat', contextWindow: '128K', pricing: '$0.00055/$0.00219' },
      { id: 'deepseek-chat',     capability: 'Chat', contextWindow: '64K',  pricing: '$0.00014/$0.00028' },
    ],
  },
  // Anthropic, OpenAI, Google removed — custom providers only (zai, minimax, deepseek)
];

// ============================================
// Helpers
// ============================================

/** Return the config file path: <cwd>/.claude-flow/providers.json */
function getConfigPath(cwd: string): string {
  return path.join(cwd, '.claude-flow', 'providers.json');
}

interface ProviderConfigFile {
  providers: Record<string, {
    apiKey?: string;
    model?: string;
    endpoint?: string;
  }>;
}

function readConfigFile(cwd: string): ProviderConfigFile {
  const cfgPath = getConfigPath(cwd);
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch {
      return { providers: {} };
    }
  }
  return { providers: {} };
}

function writeConfigFile(cwd: string, config: ProviderConfigFile): void {
  const cfgPath = getConfigPath(cwd);
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Resolve the API key for a provider.
 * Priority: environment variable > providers.json config file
 */
function resolveApiKey(provider: ProviderEntry, cwd: string): string | undefined {
  // Check primary env var
  const envVal = process.env[provider.envKey];
  if (envVal) return envVal;

  // Check config file
  const config = readConfigFile(cwd);
  return config.providers[provider.name]?.apiKey;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****' + key.slice(-4);
  return '****' + key.slice(-4);
}

/**
 * Get the usage metrics file path and read it if it exists.
 */
function getUsageMetricsPath(cwd: string): string {
  return path.join(cwd, '.claude-flow', 'metrics', 'provider-usage.json');
}

interface UsageRecord {
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  lastUsed?: string;
}

function readUsageMetrics(cwd: string): UsageRecord[] | null {
  const metricsPath = getUsageMetricsPath(cwd);
  if (fs.existsSync(metricsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
      if (Array.isArray(data.providers)) return data.providers as UsageRecord[];
      if (Array.isArray(data)) return data as UsageRecord[];
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================
// List subcommand
// ============================================

const listCommand: Command = {
  name: 'list',
  description: 'List available AI providers and their API key status',
  options: [
    { name: 'json', short: 'j', type: 'boolean', description: 'Output as JSON' },
  ],
  examples: [
    { command: 'claude-flow providers list', description: 'List all providers' },
    { command: 'claude-flow providers list --json', description: 'List as JSON' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const asJson = ctx.flags.json as boolean;
    const cwd = ctx.cwd || process.cwd();
    const config = readConfigFile(cwd);

    const rows = PROVIDER_REGISTRY.map(p => {
      const key = resolveApiKey(p, cwd);
      const hasKey = !!key;
      const cfgEntry = config.providers[p.name];
      const customModel = cfgEntry?.model;
      const customEndpoint = cfgEntry?.endpoint;

      return {
        provider: p.displayName,
        envVar: p.envKey,
        apiKey: hasKey ? output.success('Set (' + maskKey(key!) + ')') : output.dim('Not set'),
        defaultModel: customModel || p.defaultModel,
        endpoint: customEndpoint || p.apiEndpoint,
        _hasKey: hasKey,
      };
    });

    if (asJson) {
      const jsonData = rows.map(r => ({
        provider: r.provider,
        envVar: r.envVar,
        hasKey: r._hasKey,
        defaultModel: r.defaultModel,
        endpoint: r.endpoint,
      }));
      output.printJson(jsonData);
      return { success: true };
    }

    output.writeln();
    output.writeln(output.bold('Available Providers'));
    output.writeln(output.dim('Showing API key status from environment variables and .claude-flow/providers.json'));
    output.writeln();

    output.printTable({
      columns: [
        { key: 'provider',     header: 'Provider',      width: 16 },
        { key: 'envVar',       header: 'Env Variable',  width: 22 },
        { key: 'apiKey',       header: 'API Key',       width: 20 },
        { key: 'defaultModel', header: 'Default Model', width: 24 },
        { key: 'endpoint',     header: 'API Endpoint',  width: 42 },
      ],
      data: rows,
    });

    const configured = rows.filter(r => r._hasKey).length;
    output.writeln();
    output.writeln(output.dim(`${configured}/${rows.length} providers have API keys configured`));

    return { success: true };
  },
};

// ============================================
// Configure subcommand
// ============================================

const configureCommand: Command = {
  name: 'configure',
  description: 'Configure provider settings and API keys',
  options: [
    { name: 'provider', short: 'p', type: 'string', description: 'Provider name (zai, minimax, deepseek)', required: true },
    { name: 'key', short: 'k', type: 'string', description: 'API key' },
    { name: 'model', short: 'm', type: 'string', description: 'Default model' },
    { name: 'endpoint', short: 'e', type: 'string', description: 'Custom endpoint URL' },
  ],
  examples: [
    { command: 'claude-flow providers configure -p zai -k <key>', description: 'Set ZAI key' },
    { command: 'claude-flow providers configure -p zai -m glm-5-turbo', description: 'Set ZAI default model' },
    { command: 'claude-flow providers configure -p deepseek -e https://custom.endpoint.com/v1', description: 'Set custom endpoint' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const providerName = (ctx.flags.provider as string || '').toLowerCase();
    const apiKey = ctx.flags.key as string | undefined;
    const model = ctx.flags.model as string | undefined;
    const endpoint = ctx.flags.endpoint as string | undefined;
    const cwd = ctx.cwd || process.cwd();

    if (!providerName) {
      output.printError('Provider name is required (-p <provider>)');
      output.writeln(output.dim('Available: ' + PROVIDER_REGISTRY.map(p => p.name).join(', ')));
      return { success: false, exitCode: 1 };
    }

    const registryEntry = PROVIDER_REGISTRY.find(p => p.name === providerName);
    if (!registryEntry) {
      output.printError(`Unknown provider: ${providerName}`);
      output.writeln(output.dim('Available: ' + PROVIDER_REGISTRY.map(p => p.name).join(', ')));
      return { success: false, exitCode: 1 };
    }

    if (!apiKey && !model && !endpoint) {
      output.printError('At least one of --key, --model, or --endpoint must be specified');
      return { success: false, exitCode: 1 };
    }

    // Validate model if provided
    if (model) {
      const validModels = registryEntry.models.map(m => m.id);
      if (!validModels.includes(model)) {
        output.printWarning(`Model "${model}" is not in the known model list for ${registryEntry.displayName}`);
        output.writeln(output.dim('Known models: ' + validModels.join(', ')));
        output.writeln(output.dim('Saving anyway in case this is a new/custom model.'));
      }
    }

    // Read existing config, update, and write
    const config = readConfigFile(cwd);
    if (!config.providers[providerName]) {
      config.providers[providerName] = {};
    }
    if (apiKey) config.providers[providerName].apiKey = apiKey;
    if (model) config.providers[providerName].model = model;
    if (endpoint) config.providers[providerName].endpoint = endpoint;

    writeConfigFile(cwd, config);

    const cfgPath = getConfigPath(cwd);

    output.writeln();
    output.printBox([
      `Provider: ${registryEntry.displayName}`,
      `API Key:  ${apiKey ? maskKey(apiKey) : '(unchanged)'}`,
      `Model:    ${model || '(unchanged)'}`,
      `Endpoint: ${endpoint || '(unchanged)'}`,
      ``,
      `Saved to: ${cfgPath}`,
    ].join('\n'), 'Configuration Updated');

    output.writeln();
    output.printSuccess(`${registryEntry.displayName} configuration saved`);

    return { success: true };
  },
};

// ============================================
// Test subcommand
// ============================================

/**
 * Perform a lightweight HTTP connectivity check against a provider's endpoint.
 * Uses native fetch (Node 18+).
 *
 * For OpenAI-compatible (bearer auth): GET /models
 * For Anthropic-compatible (x-api-key): POST /messages with minimal body
 *   (will return 400 for bad body but proves auth + connectivity work)
 */
async function testProviderConnectivity(
  provider: ProviderEntry,
  apiKey: string,
  customEndpoint?: string,
): Promise<{ ok: boolean; latencyMs: number; statusCode: number; detail: string }> {
  const baseUrl = customEndpoint || provider.apiEndpoint;
  const url = baseUrl + provider.healthPath;
  const start = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.extraHeaders || {}),
  };

  if (provider.authStyle === 'bearer') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let response: Response;

    if (provider.authStyle === 'bearer') {
      // OpenAI-compatible: GET /models is lightweight
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } else {
      // Anthropic-compatible: POST /messages with minimal body
      // A 400 for invalid body still proves connectivity and auth
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const statusCode = response.status;

    // 200-299 = success, 400 = auth passed but bad request (still proves connectivity)
    // 401/403 = auth failed, 429 = rate limited (but connected)
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, latencyMs, statusCode, detail: 'Connected' };
    } else if (statusCode === 400) {
      return { ok: true, latencyMs, statusCode, detail: 'Connected (auth OK)' };
    } else if (statusCode === 401 || statusCode === 403) {
      return { ok: false, latencyMs, statusCode, detail: 'Authentication failed' };
    } else if (statusCode === 429) {
      return { ok: true, latencyMs, statusCode, detail: 'Connected (rate limited)' };
    } else {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      return { ok: false, latencyMs, statusCode, detail: `HTTP ${statusCode}: ${body.slice(0, 100)}` };
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort')) {
      return { ok: false, latencyMs, statusCode: 0, detail: 'Timeout (15s)' };
    }
    return { ok: false, latencyMs, statusCode: 0, detail: message.slice(0, 100) };
  }
}

const testCommand: Command = {
  name: 'test',
  description: 'Test provider connectivity with real HTTP checks',
  options: [
    { name: 'provider', short: 'p', type: 'string', description: 'Provider to test (zai, minimax, deepseek)' },
    { name: 'all', short: 'a', type: 'boolean', description: 'Test all providers that have API keys configured' },
  ],
  examples: [
    { command: 'claude-flow providers test -p zai', description: 'Test ZAI connection' },
    { command: 'claude-flow providers test --all', description: 'Test all configured providers' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const providerName = (ctx.flags.provider as string || '').toLowerCase();
    const testAll = ctx.flags.all as boolean;
    const cwd = ctx.cwd || process.cwd();
    const config = readConfigFile(cwd);

    if (!providerName && !testAll) {
      output.printError('Specify a provider with -p <name> or use --all to test all configured providers');
      output.writeln(output.dim('Available: ' + PROVIDER_REGISTRY.map(p => p.name).join(', ')));
      return { success: false, exitCode: 1 };
    }

    // Determine which providers to test
    let providersToTest: ProviderEntry[];
    if (testAll) {
      providersToTest = PROVIDER_REGISTRY;
    } else {
      const entry = PROVIDER_REGISTRY.find(p => p.name === providerName);
      if (!entry) {
        output.printError(`Unknown provider: ${providerName}`);
        output.writeln(output.dim('Available: ' + PROVIDER_REGISTRY.map(p => p.name).join(', ')));
        return { success: false, exitCode: 1 };
      }
      providersToTest = [entry];
    }

    output.writeln();
    output.writeln(output.bold('Provider Connectivity Test'));
    output.writeln(output.dim('Testing real HTTP connectivity to provider endpoints'));
    output.writeln();

    let passCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const provider of providersToTest) {
      const apiKey = resolveApiKey(provider, cwd);
      const customEndpoint = config.providers[provider.name]?.endpoint;

      if (!apiKey) {
        output.writeln(
          `  ${output.warning('SKIP')} ${provider.displayName.padEnd(16)} ` +
          output.dim(`No API key (set ${provider.envKey} or use providers configure)`)
        );
        skipCount++;
        continue;
      }

      const spinner = output.createSpinner({
        text: `Testing ${provider.displayName}...`,
        spinner: 'dots',
      });
      spinner.start();

      const result = await testProviderConnectivity(provider, apiKey, customEndpoint);

      if (result.ok) {
        spinner.succeed(
          `${provider.displayName.padEnd(16)} ${result.detail}  ${output.dim(`${result.latencyMs}ms`)}`
        );
        passCount++;
      } else {
        spinner.fail(
          `${provider.displayName.padEnd(16)} ${result.detail}  ${output.dim(`${result.latencyMs}ms`)}`
        );
        failCount++;
      }
    }

    output.writeln();
    const parts: string[] = [];
    if (passCount > 0) parts.push(output.success(`${passCount} passed`));
    if (failCount > 0) parts.push(output.error(`${failCount} failed`));
    if (skipCount > 0) parts.push(output.warning(`${skipCount} skipped`));
    output.writeln(`Results: ${parts.join(', ')}`);

    if (failCount > 0) {
      return { success: false, exitCode: 1 };
    }
    return { success: true };
  },
};

// ============================================
// Models subcommand
// ============================================

const modelsCommand: Command = {
  name: 'models',
  description: 'List available models from all providers',
  options: [
    { name: 'provider', short: 'p', type: 'string', description: 'Filter by provider name' },
    { name: 'capability', short: 'c', type: 'string', description: 'Filter by capability: Chat, Embedding' },
    { name: 'json', short: 'j', type: 'boolean', description: 'Output as JSON' },
  ],
  examples: [
    { command: 'claude-flow providers models', description: 'List all models' },
    { command: 'claude-flow providers models -p zai', description: 'List ZAI models' },
    { command: 'claude-flow providers models -c Embedding', description: 'List embedding models' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const filterProvider = (ctx.flags.provider as string || '').toLowerCase();
    const filterCapability = (ctx.flags.capability as string || '').toLowerCase();
    const asJson = ctx.flags.json as boolean;

    let providers = PROVIDER_REGISTRY;
    if (filterProvider) {
      providers = providers.filter(p => p.name === filterProvider);
      if (providers.length === 0) {
        output.printError(`Unknown provider: ${filterProvider}`);
        output.writeln(output.dim('Available: ' + PROVIDER_REGISTRY.map(p => p.name).join(', ')));
        return { success: false, exitCode: 1 };
      }
    }

    const rows: Array<{
      model: string;
      provider: string;
      capability: string;
      context: string;
      cost: string;
    }> = [];

    for (const p of providers) {
      for (const m of p.models) {
        if (filterCapability && m.capability.toLowerCase() !== filterCapability) {
          continue;
        }
        rows.push({
          model: m.id,
          provider: p.displayName,
          capability: m.capability,
          context: m.contextWindow,
          cost: m.pricing,
        });
      }
    }

    if (asJson) {
      output.printJson(rows);
      return { success: true };
    }

    output.writeln();
    output.writeln(output.bold('Available Models'));
    if (filterProvider) {
      output.writeln(output.dim(`Filtered by provider: ${filterProvider}`));
    }
    if (filterCapability) {
      output.writeln(output.dim(`Filtered by capability: ${filterCapability}`));
    }
    output.writeln();

    output.printTable({
      columns: [
        { key: 'model',      header: 'Model',      width: 30 },
        { key: 'provider',   header: 'Provider',   width: 16 },
        { key: 'capability', header: 'Capability', width: 12 },
        { key: 'context',    header: 'Context',    width: 10 },
        { key: 'cost',       header: 'Cost/1K',    width: 20 },
      ],
      data: rows,
    });

    output.writeln();
    output.writeln(output.dim(`${rows.length} models across ${providers.length} provider(s)`));

    return { success: true };
  },
};

// ============================================
// Usage subcommand
// ============================================

const usageCommand: Command = {
  name: 'usage',
  description: 'View provider usage metrics (reads from .claude-flow/metrics/provider-usage.json)',
  options: [
    { name: 'provider', short: 'p', type: 'string', description: 'Filter by provider' },
    { name: 'json', short: 'j', type: 'boolean', description: 'Output as JSON' },
  ],
  examples: [
    { command: 'claude-flow providers usage', description: 'View all usage' },
    { command: 'claude-flow providers usage -p zai', description: 'View ZAI usage' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const filterProvider = (ctx.flags.provider as string || '').toLowerCase();
    const asJson = ctx.flags.json as boolean;
    const cwd = ctx.cwd || process.cwd();

    const metrics = readUsageMetrics(cwd);

    if (!metrics || metrics.length === 0) {
      output.writeln();
      output.writeln(output.bold('Provider Usage'));
      output.writeln();
      output.writeln(output.dim('No usage data available yet.'));
      output.writeln(output.dim(`Metrics will be recorded to: ${getUsageMetricsPath(cwd)}`));
      output.writeln(output.dim('Usage data is collected when providers are used through claude-flow.'));
      return { success: true };
    }

    let data = metrics;
    if (filterProvider) {
      data = data.filter(m => m.provider.toLowerCase() === filterProvider);
    }

    if (data.length === 0) {
      output.writeln();
      output.writeln(output.dim(`No usage data found for provider: ${filterProvider}`));
      return { success: true };
    }

    if (asJson) {
      output.printJson(data);
      return { success: true };
    }

    output.writeln();
    output.writeln(output.bold('Provider Usage'));
    output.writeln();

    const formatNumber = (n: number): string => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    };

    output.printTable({
      columns: [
        { key: 'provider',   header: 'Provider',   width: 16 },
        { key: 'requests',   header: 'Requests',   width: 12 },
        { key: 'inTokens',   header: 'In Tokens',  width: 12 },
        { key: 'outTokens',  header: 'Out Tokens', width: 12 },
        { key: 'cost',       header: 'Est. Cost',  width: 12 },
        { key: 'lastUsed',   header: 'Last Used',  width: 16 },
      ],
      data: data.map(m => ({
        provider: m.provider,
        requests: formatNumber(m.requests),
        inTokens: formatNumber(m.inputTokens),
        outTokens: formatNumber(m.outputTokens),
        cost: `$${m.estimatedCost.toFixed(2)}`,
        lastUsed: m.lastUsed || output.dim('N/A'),
      })),
    });

    const totalRequests = data.reduce((s, m) => s + m.requests, 0);
    const totalIn = data.reduce((s, m) => s + m.inputTokens, 0);
    const totalOut = data.reduce((s, m) => s + m.outputTokens, 0);
    const totalCost = data.reduce((s, m) => s + m.estimatedCost, 0);

    output.writeln();
    output.printBox([
      `Total Requests:     ${formatNumber(totalRequests)}`,
      `Total Input Tokens: ${formatNumber(totalIn)}`,
      `Total Output Tokens: ${formatNumber(totalOut)}`,
      `Total Estimated Cost: $${totalCost.toFixed(2)}`,
    ].join('\n'), 'Summary');

    return { success: true };
  },
};

// ============================================
// Main providers command
// ============================================

export const providersCommand: Command = {
  name: 'providers',
  description: 'Manage AI providers, models, and configurations',
  subcommands: [listCommand, configureCommand, testCommand, modelsCommand, usageCommand],
  examples: [
    { command: 'claude-flow providers list', description: 'List all providers and key status' },
    { command: 'claude-flow providers configure -p zai -k <key>', description: 'Configure ZAI' },
    { command: 'claude-flow providers test --all', description: 'Test all configured providers' },
    { command: 'claude-flow providers models', description: 'List all available models' },
    { command: 'claude-flow providers usage', description: 'View usage metrics' },
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('RuFlo Provider Management'));
    output.writeln(output.dim('Multi-provider AI orchestration'));
    output.writeln();
    output.writeln('Subcommands:');
    output.printList([
      'list      - List available providers and their API key status',
      'configure - Configure provider API keys, models, and endpoints',
      'test      - Test provider connectivity with real HTTP checks',
      'models    - List available models from all providers',
      'usage     - View provider usage metrics',
    ]);
    output.writeln();
    output.writeln('Supported Providers:');
    output.printList(PROVIDER_REGISTRY.map(p => `${p.displayName} (${p.envKey})`));
    output.writeln();
    return { success: true };
  },
};

export default providersCommand;
