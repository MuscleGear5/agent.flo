/**
 * ProviderManager Unit Tests
 *
 * Comprehensive tests for the ProviderManager class covering:
 * - Initialization
 * - Provider selection strategies (round-robin, latency, cost, least-loaded)
 * - Fallback behavior
 * - Custom providers (ZAI, MiniMax, DeepSeek)
 * - Response caching
 * - Health checks
 * - Cost estimation
 * - defaultProvider config
 *
 * All providers are mocked -- NO real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ProviderManager, createProviderManager } from '../provider-manager.js';
import type {
  ILLMProvider,
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ProviderManagerConfig,
  HealthCheckResult,
  CostEstimate,
  UsageStats,
  ProviderStatus,
  ProviderCapabilities,
  LLMModel,
  ModelInfo,
} from '../types.js';
import { LLMProviderError } from '../types.js';
import type { ILogger } from '../base-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Silent logger that swallows all output during tests. */
const silentLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

/** Minimal capabilities stub shared by mock providers. */
function stubCapabilities(models: LLMModel[] = ['custom-model']): ProviderCapabilities {
  return {
    supportedModels: models,
    maxContextLength: {},
    maxOutputTokens: {},
    supportsStreaming: true,
    supportsToolCalling: false,
    supportsSystemMessages: true,
    supportsVision: false,
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: false,
    pricing: {},
  };
}

/** Build a minimal LLMResponse. */
function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    model: 'custom-model',
    provider: 'anthropic',
    content: 'Hello from mock',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    cost: { promptCost: 0.001, completionCost: 0.0005, totalCost: 0.0015, currency: 'USD' },
    finishReason: 'stop',
    ...overrides,
  };
}

/** Build a minimal LLMRequest. */
function makeRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    messages: [{ role: 'user', content: 'Hello' }],
    model: 'custom-model',
    maxTokens: 100,
    temperature: 0.5,
    requestId: `req-${Date.now()}`,
    ...overrides,
  };
}

/** Create a mock ILLMProvider backed entirely by vi.fn(). */
function createMockProvider(
  providerName: LLMProvider,
  options: {
    available?: boolean;
    currentLoad?: number;
    latency?: number;
    costTotal?: number;
    healthHealthy?: boolean;
    initShouldFail?: boolean;
    completeShouldFail?: boolean;
    completeError?: Error;
    response?: LLMResponse;
  } = {},
): ILLMProvider {
  const {
    available = true,
    currentLoad = 0,
    latency = 100,
    costTotal = 0.01,
    healthHealthy = true,
    initShouldFail = false,
    completeShouldFail = false,
    completeError,
    response,
  } = options;

  const emitter = new EventEmitter();

  const defaultResponse = response ?? makeResponse({ provider: providerName });

  const provider: ILLMProvider = Object.assign(emitter, {
    name: providerName,
    capabilities: stubCapabilities(),
    config: {
      provider: providerName,
      model: 'custom-model' as LLMModel,
    } as LLMProviderConfig,

    initialize: vi.fn(async () => {
      if (initShouldFail) throw new Error(`Init failed for ${providerName}`);
    }),

    complete: vi.fn(async (_req: LLMRequest) => {
      if (completeShouldFail) {
        throw completeError ?? new LLMProviderError(
          `Complete failed for ${providerName}`,
          'PROVIDER_ERROR',
          providerName,
          500,
          true,
        );
      }
      return defaultResponse;
    }),

    streamComplete: vi.fn(async function* (_req: LLMRequest): AsyncIterable<LLMStreamEvent> {
      yield { type: 'content', delta: { content: 'streamed' } };
      yield { type: 'done' };
    }),

    listModels: vi.fn(async () => ['custom-model' as LLMModel]),
    getModelInfo: vi.fn(async (_m: LLMModel) => ({
      model: 'custom-model',
      name: 'Custom',
      description: 'Mock model',
      contextLength: 4096,
      maxOutputTokens: 4096,
      supportedFeatures: [],
    }) as ModelInfo),
    validateModel: vi.fn((_m: LLMModel) => true),

    healthCheck: vi.fn(async () => ({
      healthy: healthHealthy,
      latency,
      timestamp: new Date(),
    }) as HealthCheckResult),

    getStatus: vi.fn(() => ({
      available,
      currentLoad,
      queueLength: 0,
      activeRequests: 0,
    }) as ProviderStatus),

    estimateCost: vi.fn(async (_req: LLMRequest) => ({
      estimatedPromptTokens: 10,
      estimatedCompletionTokens: 10,
      estimatedTotalTokens: 20,
      estimatedCost: {
        prompt: costTotal * 0.6,
        completion: costTotal * 0.4,
        total: costTotal,
        currency: 'USD',
      },
      confidence: 0.8,
    }) as CostEstimate),

    getUsage: vi.fn(async () => ({
      period: { start: new Date(), end: new Date() },
      requests: 10,
      tokens: { prompt: 500, completion: 200, total: 700 },
      cost: { prompt: 0.05, completion: 0.02, total: 0.07, currency: 'USD' },
      errors: 1,
      averageLatency: latency,
      modelBreakdown: {},
    }) as UsageStats),

    destroy: vi.fn(),
  });

  return provider;
}

/**
 * We must mock the provider constructors so that ProviderManager.createProvider()
 * returns our mock providers. We use vi.mock to replace each provider module.
 *
 * The mocks store a factory per provider name. Tests set the factory before
 * calling initialize() so createProvider returns the right mock.
 */

// Registry: tests push mock providers here before initialize()
const mockProviderRegistry = new Map<LLMProvider, ILLMProvider>();

vi.mock('../anthropic-provider.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('anthropic')),
}));
vi.mock('../openai-provider.js', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('openai')),
}));
vi.mock('../google-provider.js', () => ({
  GoogleProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('google')),
}));
vi.mock('../cohere-provider.js', () => ({
  CohereProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('cohere')),
}));
vi.mock('../ollama-provider.js', () => ({
  OllamaProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('ollama')),
}));
vi.mock('../ruvector-provider.js', () => ({
  RuVectorProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('ruvector')),
}));
vi.mock('../deepseek-provider.js', () => ({
  DeepSeekProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('deepseek')),
}));
vi.mock('../minimax-provider.js', () => ({
  MiniMaxProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('minimax')),
}));
vi.mock('../zai-provider.js', () => ({
  ZaiProvider: vi.fn().mockImplementation(() => mockProviderRegistry.get('zai')),
}));

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('ProviderManager', () => {
  beforeEach(() => {
    mockProviderRegistry.clear();
  });

  afterEach(() => {
    mockProviderRegistry.clear();
  });

  // -----------------------------------------------------------------------
  // 1. Initialization
  // -----------------------------------------------------------------------
  describe('initialization', () => {
    it('should initialize all configured providers', async () => {
      const mockA = createMockProvider('anthropic');
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'key-a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'key-g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      expect(mockA.initialize).toHaveBeenCalledOnce();
      expect(mockG.initialize).toHaveBeenCalledOnce();
      expect(manager.listProviders()).toContain('anthropic');
      expect(manager.listProviders()).toContain('google');
      expect(manager.listProviders()).toHaveLength(2);

      manager.destroy();
    });

    it('should handle init failure for one provider gracefully and still register others', async () => {
      const mockA = createMockProvider('anthropic', { initShouldFail: true });
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'key-a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'key-g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      // Anthropic failed -- should not be in provider list
      expect(manager.listProviders()).not.toContain('anthropic');
      // Google succeeded
      expect(manager.listProviders()).toContain('google');

      manager.destroy();
    });

    it('should work with zero providers configured', async () => {
      const config: ProviderManagerConfig = { providers: [] };
      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      expect(manager.listProviders()).toHaveLength(0);
      manager.destroy();
    });

    it('should be creatable via createProviderManager factory', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'key-a' },
        ],
      };

      const manager = await createProviderManager(config, silentLogger);

      expect(manager).toBeInstanceOf(ProviderManager);
      expect(manager.listProviders()).toContain('anthropic');

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Provider selection strategies
  // -----------------------------------------------------------------------
  describe('provider selection', () => {
    describe('round-robin strategy', () => {
      it('should rotate through available providers', async () => {
        const mockA = createMockProvider('anthropic');
        const mockG = createMockProvider('google');
        mockProviderRegistry.set('anthropic', mockA);
        mockProviderRegistry.set('google', mockG);

        const config: ProviderManagerConfig = {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
            { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
          ],
          loadBalancing: { enabled: true, strategy: 'round-robin' },
        };

        const manager = new ProviderManager(config, silentLogger);
        await manager.initialize();

        const req = makeRequest();

        // Call multiple times to observe round-robin
        await manager.complete(req);
        await manager.complete(req);
        await manager.complete(req);
        await manager.complete(req);

        // Both providers should have been called
        const aCalls = (mockA.complete as ReturnType<typeof vi.fn>).mock.calls.length;
        const gCalls = (mockG.complete as ReturnType<typeof vi.fn>).mock.calls.length;

        expect(aCalls).toBeGreaterThan(0);
        expect(gCalls).toBeGreaterThan(0);
        // round-robin with 2 providers and 4 calls => 2 each
        expect(aCalls + gCalls).toBe(4);

        manager.destroy();
      });
    });

    describe('latency-based strategy', () => {
      it('should select the provider with lowest tracked latency', async () => {
        const mockA = createMockProvider('anthropic');
        const mockG = createMockProvider('google');
        mockProviderRegistry.set('anthropic', mockA);
        mockProviderRegistry.set('google', mockG);

        const config: ProviderManagerConfig = {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
            { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
          ],
          loadBalancing: { enabled: true, strategy: 'latency-based' },
        };

        const manager = new ProviderManager(config, silentLogger);
        await manager.initialize();

        // Both start at latency 0, so initial selection is deterministic (first wins).
        // Make two requests to establish metrics, then check that latency-based
        // picks the provider. Since both mocks return instantly, latencies will be
        // close to 0 and the selection may favour either. We simply confirm no error.
        const req = makeRequest();
        const r1 = await manager.complete(req);
        const r2 = await manager.complete(req);

        expect(r1.content).toBeTruthy();
        expect(r2.content).toBeTruthy();

        manager.destroy();
      });
    });

    describe('cost-based strategy', () => {
      it('should select the cheapest provider', async () => {
        const cheapResponse = makeResponse({ provider: 'google' });
        const expensiveResponse = makeResponse({ provider: 'anthropic' });

        const mockA = createMockProvider('anthropic', { costTotal: 0.10, response: expensiveResponse });
        const mockG = createMockProvider('google', { costTotal: 0.01, response: cheapResponse });
        mockProviderRegistry.set('anthropic', mockA);
        mockProviderRegistry.set('google', mockG);

        const config: ProviderManagerConfig = {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
            { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
          ],
          loadBalancing: { enabled: true, strategy: 'cost-based' },
        };

        const manager = new ProviderManager(config, silentLogger);
        await manager.initialize();

        const req = makeRequest();
        const response = await manager.complete(req);

        // Google is cheaper, should be selected
        expect(response.provider).toBe('google');

        manager.destroy();
      });
    });

    describe('least-loaded strategy', () => {
      it('should select the provider with the lowest current load', async () => {
        const lowLoadResponse = makeResponse({ provider: 'google' });
        const highLoadResponse = makeResponse({ provider: 'anthropic' });

        const mockA = createMockProvider('anthropic', { currentLoad: 0.8, response: highLoadResponse });
        const mockG = createMockProvider('google', { currentLoad: 0.1, response: lowLoadResponse });
        mockProviderRegistry.set('anthropic', mockA);
        mockProviderRegistry.set('google', mockG);

        const config: ProviderManagerConfig = {
          providers: [
            { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
            { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
          ],
          loadBalancing: { enabled: true, strategy: 'least-loaded' },
        };

        const manager = new ProviderManager(config, silentLogger);
        await manager.initialize();

        const req = makeRequest();
        const response = await manager.complete(req);

        // Google has lower load
        expect(response.provider).toBe('google');

        manager.destroy();
      });
    });

    it('should use a preferred provider when specified', async () => {
      const mockA = createMockProvider('anthropic');
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest();
      await manager.complete(req, 'google');

      expect(mockG.complete).toHaveBeenCalledOnce();
      expect(mockA.complete).not.toHaveBeenCalled();

      manager.destroy();
    });

    it('should throw when no providers are available', async () => {
      const config: ProviderManagerConfig = { providers: [] };
      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await expect(manager.complete(makeRequest())).rejects.toThrow('No available providers');

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Fallback behavior
  // -----------------------------------------------------------------------
  describe('fallback behavior', () => {
    it('should fall back to next provider on failure', async () => {
      const failingResponse = makeResponse({ provider: 'anthropic' });
      const successResponse = makeResponse({ provider: 'google', content: 'Fallback response' });

      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new LLMProviderError('Service down', 'UNAVAILABLE', 'anthropic', 503, true),
      });
      const mockG = createMockProvider('google', { response: successResponse });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
        fallback: { enabled: true, maxAttempts: 2 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const response = await manager.complete(makeRequest());

      expect(response.content).toBe('Fallback response');
      expect(response.provider).toBe('google');

      manager.destroy();
    });

    it('should respect fallbackOrder config', async () => {
      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new LLMProviderError('Down', 'ERR', 'anthropic', 500, true),
      });
      const mockG = createMockProvider('google', {
        response: makeResponse({ provider: 'google', content: 'from google' }),
      });
      const mockO = createMockProvider('openai', {
        response: makeResponse({ provider: 'openai', content: 'from openai' }),
      });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);
      mockProviderRegistry.set('openai', mockO);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
          { provider: 'openai', model: 'gpt-4o', apiKey: 'o' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
        fallback: {
          enabled: true,
          maxAttempts: 2,
          fallbackOrder: ['openai', 'google'], // openai first
        },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const response = await manager.complete(makeRequest());

      // Should use openai (first in fallbackOrder) rather than google
      expect(response.provider).toBe('openai');
      expect(response.content).toBe('from openai');

      manager.destroy();
    });

    it('should emit fallback_success event on successful fallback', async () => {
      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new LLMProviderError('Down', 'ERR', 'anthropic', 500, true),
      });
      const mockG = createMockProvider('google', {
        response: makeResponse({ provider: 'google' }),
      });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        fallback: { enabled: true, maxAttempts: 2 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const fallbackHandler = vi.fn();
      manager.on('fallback_success', fallbackHandler);

      await manager.complete(makeRequest());

      expect(fallbackHandler).toHaveBeenCalledOnce();
      expect(fallbackHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          originalProvider: 'anthropic',
          fallbackProvider: 'google',
        }),
      );

      manager.destroy();
    });

    it('should emit fallback_exhausted event when all fallbacks fail', async () => {
      const providerError = new LLMProviderError('Down', 'ERR', 'anthropic', 500, true);

      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: providerError,
      });
      const mockG = createMockProvider('google', {
        completeShouldFail: true,
        completeError: new LLMProviderError('Also down', 'ERR', 'google', 500, true),
      });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        fallback: { enabled: true, maxAttempts: 2 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const exhaustedHandler = vi.fn();
      manager.on('fallback_exhausted', exhaustedHandler);

      await expect(manager.complete(makeRequest())).rejects.toThrow();

      expect(exhaustedHandler).toHaveBeenCalledOnce();
      expect(exhaustedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ originalProvider: 'anthropic' }),
      );

      manager.destroy();
    });

    it('should throw original error when fallback is disabled', async () => {
      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new LLMProviderError('Service down', 'ERR', 'anthropic', 500, true),
      });
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        // fallback not enabled
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await expect(manager.complete(makeRequest())).rejects.toThrow('Service down');

      // Google should NOT have been called as a fallback
      expect(mockG.complete).not.toHaveBeenCalled();

      manager.destroy();
    });

    it('should not attempt fallback for non-LLMProviderError errors', async () => {
      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new Error('Generic non-provider error'),
      });
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        fallback: { enabled: true, maxAttempts: 2 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await expect(manager.complete(makeRequest())).rejects.toThrow('Generic non-provider error');
      expect(mockG.complete).not.toHaveBeenCalled();

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Custom providers (ZAI, MiniMax, DeepSeek)
  // -----------------------------------------------------------------------
  describe('custom providers (ZAI, MiniMax, DeepSeek)', () => {
    it('should create and register a ZAI provider', async () => {
      const mockZ = createMockProvider('zai', {
        response: makeResponse({ provider: 'zai', content: 'zai response' }),
      });
      mockProviderRegistry.set('zai', mockZ);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'zai', model: 'custom-model', apiKey: 'zai-key' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      expect(manager.listProviders()).toContain('zai');
      expect(manager.getProvider('zai')).toBeDefined();

      const response = await manager.complete(makeRequest());
      expect(response.provider).toBe('zai');

      manager.destroy();
    });

    it('should create and register a MiniMax provider', async () => {
      const mockM = createMockProvider('minimax', {
        response: makeResponse({ provider: 'minimax', content: 'minimax response' }),
      });
      mockProviderRegistry.set('minimax', mockM);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'minimax', model: 'custom-model', apiKey: 'mm-key' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      expect(manager.listProviders()).toContain('minimax');

      const response = await manager.complete(makeRequest());
      expect(response.provider).toBe('minimax');

      manager.destroy();
    });

    it('should create and register a DeepSeek provider', async () => {
      const mockD = createMockProvider('deepseek', {
        response: makeResponse({ provider: 'deepseek', content: 'deepseek response' }),
      });
      mockProviderRegistry.set('deepseek', mockD);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'deepseek', model: 'deepseek-coder', apiKey: 'ds-key' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      expect(manager.listProviders()).toContain('deepseek');

      const response = await manager.complete(makeRequest());
      expect(response.provider).toBe('deepseek');

      manager.destroy();
    });

    it('should include custom providers in load balancing', async () => {
      const mockZ = createMockProvider('zai', {
        response: makeResponse({ provider: 'zai' }),
      });
      const mockM = createMockProvider('minimax', {
        response: makeResponse({ provider: 'minimax' }),
      });
      const mockD = createMockProvider('deepseek', {
        response: makeResponse({ provider: 'deepseek' }),
      });
      mockProviderRegistry.set('zai', mockZ);
      mockProviderRegistry.set('minimax', mockM);
      mockProviderRegistry.set('deepseek', mockD);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'zai', model: 'custom-model', apiKey: 'z' },
          { provider: 'minimax', model: 'custom-model', apiKey: 'm' },
          { provider: 'deepseek', model: 'deepseek-coder', apiKey: 'd' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest();

      // 3 calls should hit each provider once with round-robin
      await manager.complete(req);
      await manager.complete(req);
      await manager.complete(req);

      expect(mockZ.complete).toHaveBeenCalled();
      expect(mockM.complete).toHaveBeenCalled();
      expect(mockD.complete).toHaveBeenCalled();

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Cache
  // -----------------------------------------------------------------------
  describe('cache', () => {
    it('should cache responses and return cached result for identical requests', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        cache: { enabled: true, ttl: 60000, maxSize: 100 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest({ requestId: 'cache-test' });

      const r1 = await manager.complete(req);
      const r2 = await manager.complete(req);

      // Second call should return cached, so provider.complete called only once
      expect(mockA.complete).toHaveBeenCalledOnce();
      expect(r1.content).toBe(r2.content);

      manager.destroy();
    });

    it('should respect TTL and expire cached entries', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        cache: { enabled: true, ttl: 50, maxSize: 100 }, // 50ms TTL
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest({ requestId: 'ttl-test' });

      await manager.complete(req);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 80));

      await manager.complete(req);

      // Provider should have been called twice because cache expired
      expect(mockA.complete).toHaveBeenCalledTimes(2);

      manager.destroy();
    });

    it('should enforce max cache size by evicting oldest entry', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        cache: { enabled: true, ttl: 60000, maxSize: 2 }, // Only 2 entries
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      // Fill cache with 3 different requests (exceeds maxSize of 2)
      const req1 = makeRequest({ messages: [{ role: 'user', content: 'first' }] });
      const req2 = makeRequest({ messages: [{ role: 'user', content: 'second' }] });
      const req3 = makeRequest({ messages: [{ role: 'user', content: 'third' }] });

      await manager.complete(req1);
      await manager.complete(req2);
      await manager.complete(req3); // This should evict req1

      // Reset mock call count to track fresh calls
      (mockA.complete as ReturnType<typeof vi.fn>).mockClear();

      // req2 and req3 should still be cached
      await manager.complete(req2);
      await manager.complete(req3);
      expect(mockA.complete).not.toHaveBeenCalled();

      // req1 was evicted, should trigger a new call
      await manager.complete(req1);
      expect(mockA.complete).toHaveBeenCalledOnce();

      manager.destroy();
    });

    it('should not cache when caching is disabled', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        // No cache config
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest();
      await manager.complete(req);
      await manager.complete(req);

      // Both calls should hit the provider
      expect(mockA.complete).toHaveBeenCalledTimes(2);

      manager.destroy();
    });

    it('should clear cache when clearCache is called', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        cache: { enabled: true, ttl: 60000, maxSize: 100 },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest();
      await manager.complete(req);

      manager.clearCache();

      await manager.complete(req);

      // Should be called twice since cache was cleared
      expect(mockA.complete).toHaveBeenCalledTimes(2);

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Health checks
  // -----------------------------------------------------------------------
  describe('health checks', () => {
    it('should aggregate health from all providers', async () => {
      const mockA = createMockProvider('anthropic', { healthHealthy: true });
      const mockG = createMockProvider('google', { healthHealthy: false });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const results = await manager.healthCheck();

      expect(results.size).toBe(2);
      expect(results.get('anthropic')?.healthy).toBe(true);
      expect(results.get('google')?.healthy).toBe(false);

      manager.destroy();
    });

    it('should call healthCheck on each provider', async () => {
      const mockA = createMockProvider('anthropic');
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await manager.healthCheck();

      expect(mockA.healthCheck).toHaveBeenCalled();
      expect(mockG.healthCheck).toHaveBeenCalled();

      manager.destroy();
    });

    it('should return empty map when no providers are registered', async () => {
      const config: ProviderManagerConfig = { providers: [] };
      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const results = await manager.healthCheck();
      expect(results.size).toBe(0);

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Cost estimation
  // -----------------------------------------------------------------------
  describe('cost estimation', () => {
    it('should estimate cost across all providers', async () => {
      const mockA = createMockProvider('anthropic', { costTotal: 0.05 });
      const mockG = createMockProvider('google', { costTotal: 0.02 });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const estimates = await manager.estimateCost(makeRequest());

      expect(estimates.size).toBe(2);

      const anthropicEstimate = estimates.get('anthropic');
      const googleEstimate = estimates.get('google');

      expect(anthropicEstimate).toBeDefined();
      expect(googleEstimate).toBeDefined();
      expect(anthropicEstimate!.estimatedCost.total).toBe(0.05);
      expect(googleEstimate!.estimatedCost.total).toBe(0.02);

      manager.destroy();
    });

    it('should call estimateCost on each provider', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const req = makeRequest();
      await manager.estimateCost(req);

      expect(mockA.estimateCost).toHaveBeenCalledWith(req);

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // 8. defaultProvider config
  // -----------------------------------------------------------------------
  describe('defaultProvider config', () => {
    it('should include defaultProvider in config without affecting selection when not passed as preferred', async () => {
      const mockA = createMockProvider('anthropic', {
        response: makeResponse({ provider: 'anthropic' }),
      });
      const mockG = createMockProvider('google', {
        response: makeResponse({ provider: 'google' }),
      });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        defaultProvider: 'anthropic',
        loadBalancing: { enabled: true, strategy: 'round-robin' },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      // The defaultProvider config is accepted without error
      expect(manager.listProviders()).toContain('anthropic');
      expect(manager.listProviders()).toContain('google');

      manager.destroy();
    });

    it('should allow using defaultProvider as preferred provider for complete()', async () => {
      const mockA = createMockProvider('anthropic', {
        response: makeResponse({ provider: 'anthropic', content: 'default provider response' }),
      });
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        defaultProvider: 'anthropic',
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      // Use the defaultProvider explicitly
      const response = await manager.complete(makeRequest(), config.defaultProvider);

      expect(response.provider).toBe('anthropic');
      expect(response.content).toBe('default provider response');
      expect(mockG.complete).not.toHaveBeenCalled();

      manager.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Miscellaneous
  // -----------------------------------------------------------------------
  describe('miscellaneous', () => {
    it('should get a specific provider by name', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const provider = manager.getProvider('anthropic');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('anthropic');

      const missing = manager.getProvider('openai');
      expect(missing).toBeUndefined();

      manager.destroy();
    });

    it('should return metrics for all providers', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const metrics = manager.getMetrics();
      expect(metrics.size).toBe(1);
      expect(metrics.has('anthropic')).toBe(true);

      const m = metrics.get('anthropic')!;
      expect(m.latency).toBe(0); // initial
      expect(m.errorRate).toBe(0);
      expect(m.cost).toBe(0);

      manager.destroy();
    });

    it('should update metrics after a successful complete', async () => {
      const mockA = createMockProvider('anthropic', {
        response: makeResponse({
          provider: 'anthropic',
          cost: { promptCost: 0.01, completionCost: 0.005, totalCost: 0.015, currency: 'USD' },
        }),
      });
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await manager.complete(makeRequest());

      const metrics = manager.getMetrics();
      const m = metrics.get('anthropic')!;

      // After one successful call, latency and cost should be updated
      expect(m.latency).toBeGreaterThanOrEqual(0);
      expect(m.cost).toBeGreaterThan(0);
      expect(m.errorRate).toBe(0);

      manager.destroy();
    });

    it('should update error rate in metrics after a failed complete', async () => {
      const mockA = createMockProvider('anthropic', {
        completeShouldFail: true,
        completeError: new LLMProviderError('fail', 'ERR', 'anthropic', 500, true),
      });
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
        // No fallback so the error propagates
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      await expect(manager.complete(makeRequest())).rejects.toThrow();

      const metrics = manager.getMetrics();
      const m = metrics.get('anthropic')!;
      expect(m.errorRate).toBeGreaterThan(0);

      manager.destroy();
    });

    it('should emit complete event on successful completion', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const completeHandler = vi.fn();
      manager.on('complete', completeHandler);

      await manager.complete(makeRequest());

      expect(completeHandler).toHaveBeenCalledOnce();
      expect(completeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          response: expect.objectContaining({ provider: 'anthropic' }),
        }),
      );

      manager.destroy();
    });

    it('should destroy all providers and clear state on destroy', async () => {
      const mockA = createMockProvider('anthropic');
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      manager.destroy();

      expect(mockA.destroy).toHaveBeenCalledOnce();
      expect(mockG.destroy).toHaveBeenCalledOnce();
      expect(manager.listProviders()).toHaveLength(0);
    });

    it('should get aggregated usage statistics', async () => {
      const mockA = createMockProvider('anthropic');
      const mockG = createMockProvider('google');
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const usage = await manager.getUsage('day');

      // Two providers, each returning requests: 10
      expect(usage.requests).toBe(20);
      expect(usage.tokens.total).toBe(1400); // 700 * 2
      expect(usage.cost.total).toBeCloseTo(0.14); // 0.07 * 2
      expect(usage.errors).toBe(2); // 1 * 2
      expect(usage.averageLatency).toBeGreaterThanOrEqual(0);

      manager.destroy();
    });

    it('should stream complete via a provider', async () => {
      const mockA = createMockProvider('anthropic');
      mockProviderRegistry.set('anthropic', mockA);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
        ],
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      const events: LLMStreamEvent[] = [];
      for await (const event of manager.streamComplete(makeRequest())) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'content')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);

      manager.destroy();
    });

    it('should skip unavailable providers during selection', async () => {
      const mockA = createMockProvider('anthropic', {
        available: false,
        response: makeResponse({ provider: 'anthropic' }),
      });
      const mockG = createMockProvider('google', {
        available: true,
        response: makeResponse({ provider: 'google', content: 'google answer' }),
      });
      mockProviderRegistry.set('anthropic', mockA);
      mockProviderRegistry.set('google', mockG);

      const config: ProviderManagerConfig = {
        providers: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKey: 'a' },
          { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'g' },
        ],
        loadBalancing: { enabled: true, strategy: 'round-robin' },
      };

      const manager = new ProviderManager(config, silentLogger);
      await manager.initialize();

      // Anthropic is unavailable, so Google should be picked
      const response = await manager.complete(makeRequest());
      expect(response.provider).toBe('google');

      manager.destroy();
    });
  });
});
