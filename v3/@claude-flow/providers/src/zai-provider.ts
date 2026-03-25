/**
 * V3 Zai (Zhipu AI) Provider
 *
 * Zhipu AI API with OpenAI-compatible endpoint.
 * Supports GLM-5, GLM-4.7, and GLM-5-turbo models.
 *
 * @module @claude-flow/providers/zai-provider
 */

import { BaseProvider, BaseProviderOptions } from './base-provider.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  AuthenticationError,
  RateLimitError,
  LLMProviderError,
} from './types.js';

interface OpenAICompatibleRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

interface OpenAICompatibleResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class ZaiProvider extends BaseProvider {
  readonly name: LLMProvider = 'zai';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'glm-5',
      'glm-4.7',
      'glm-5-turbo',
      'glm-4-plus',
      'glm-4-flash',
    ],
    maxContextLength: {
      'glm-5': 128000,
      'glm-4.7': 128000,
      'glm-5-turbo': 128000,
      'glm-4-plus': 128000,
      'glm-4-flash': 128000,
    },
    maxOutputTokens: {
      'glm-5': 8192,
      'glm-4.7': 8192,
      'glm-5-turbo': 8192,
      'glm-4-plus': 8192,
      'glm-4-flash': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: true,
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 300,
      tokensPerMinute: 300000,
      concurrentRequests: 30,
    },
    pricing: {
      'glm-5': {
        promptCostPer1k: 0.0005,
        completionCostPer1k: 0.001,
        currency: 'USD',
      },
      'glm-4.7': {
        promptCostPer1k: 0.0003,
        completionCostPer1k: 0.0006,
        currency: 'USD',
      },
      'glm-5-turbo': {
        promptCostPer1k: 0.0002,
        completionCostPer1k: 0.0004,
        currency: 'USD',
      },
      'glm-4-plus': {
        promptCostPer1k: 0.00035,
        completionCostPer1k: 0.0007,
        currency: 'USD',
      },
      'glm-4-flash': {
        promptCostPer1k: 0.0001,
        completionCostPer1k: 0.0002,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string = 'https://api.z.ai/api/coding/paas/v4';
  private headers: Record<string, string> = {};

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  protected async doInitialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new AuthenticationError('Zai API key is required', 'zai');
    }

    this.baseUrl = this.config.apiUrl || 'https://api.z.ai/api/coding/paas/v4';
    this.headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const apiRequest = this.buildRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(apiRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as OpenAICompatibleResponse;
      return this.transformResponse(data, request);
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const apiRequest = this.buildRequest(request, true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.config.timeout || 120000) * 2);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(apiRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalOutputTokens = 0;
      let inputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              const delta = event.choices?.[0]?.delta;

              if (delta?.content) {
                yield {
                  type: 'content',
                  delta: { content: delta.content },
                };
              }

              if (event.usage) {
                inputTokens = event.usage.prompt_tokens || 0;
                totalOutputTokens = event.usage.completion_tokens || 0;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Final done event
      const model = request.model || this.config.model;
      const pricing = this.capabilities.pricing[model];
      const promptCost = (inputTokens / 1000) * (pricing?.promptCostPer1k || 0);
      const completionCost = (totalOutputTokens / 1000) * (pricing?.completionCostPer1k || 0);

      yield {
        type: 'done',
        usage: {
          promptTokens: inputTokens,
          completionTokens: totalOutputTokens,
          totalTokens: inputTokens + totalOutputTokens,
        },
        cost: {
          promptCost,
          completionCost,
          totalCost: promptCost + completionCost,
          currency: 'USD',
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const descriptions: Record<string, string> = {
      'glm-5': 'GLM-5 - Latest Zhipu AI flagship model with vision support',
      'glm-4.7': 'GLM-4.7 - Balanced performance model',
      'glm-5-turbo': 'GLM-5 Turbo - Fast and efficient model',
      'glm-4-plus': 'GLM-4 Plus - Enhanced reasoning capabilities',
      'glm-4-flash': 'GLM-4 Flash - Ultra-fast model for simple tasks',
    };

    return {
      model,
      name: model,
      description: descriptions[model] || 'Zhipu AI GLM model',
      contextLength: this.capabilities.maxContextLength[model] || 128000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ['chat', 'completion', 'tool_calling', 'vision'],
      pricing: this.capabilities.pricing[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      return {
        healthy: response.ok,
        timestamp: new Date(),
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  private buildRequest(request: LLMRequest, stream = false): OpenAICompatibleRequest {
    const messages = request.messages.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));

    const apiRequest: OpenAICompatibleRequest = {
      model: request.model || this.config.model,
      messages,
      stream,
    };

    if (request.maxTokens || this.config.maxTokens) {
      apiRequest.max_tokens = request.maxTokens ?? this.config.maxTokens;
    }

    if (request.temperature !== undefined) {
      apiRequest.temperature = request.temperature;
    } else if (this.config.temperature !== undefined) {
      apiRequest.temperature = this.config.temperature;
    }

    if (request.topP !== undefined || this.config.topP !== undefined) {
      apiRequest.top_p = request.topP ?? this.config.topP;
    }

    if (request.stopSequences || this.config.stopSequences) {
      apiRequest.stop = request.stopSequences || this.config.stopSequences;
    }

    return apiRequest;
  }

  private transformResponse(data: OpenAICompatibleResponse, request: LLMRequest): LLMResponse {
    const model = request.model || this.config.model;
    const pricing = this.capabilities.pricing[model];

    const promptCost = (data.usage.prompt_tokens / 1000) * (pricing?.promptCostPer1k || 0);
    const completionCost = (data.usage.completion_tokens / 1000) * (pricing?.completionCostPer1k || 0);

    const choice = data.choices[0];
    // GLM-5 reasoning models may return content in reasoning_content field
    const content = choice?.message?.content || choice?.message?.reasoning_content || '';

    return {
      id: data.id,
      model: model as LLMModel,
      provider: 'zai',
      content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: 'USD',
      },
      finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: { error?: { message?: string } };

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: { message: errorText } };
    }

    const message = errorData.error?.message || 'Unknown error';

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message, 'zai', errorData);
      case 429:
        throw new RateLimitError(message, 'zai', undefined, errorData);
      default:
        throw new LLMProviderError(
          message,
          `ZAI_${response.status}`,
          'zai',
          response.status,
          response.status >= 500,
          errorData
        );
    }
  }
}
