/**
 * V3 MiniMax Provider
 *
 * MiniMax API with Anthropic-compatible endpoint.
 * Supports MiniMax-M2.7 and other models.
 *
 * @module @claude-flow/providers/minimax-provider
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

interface AnthropicCompatibleRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; source?: unknown }>;
  }>;
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

interface AnthropicCompatibleResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{ type: string; text?: string; thinking?: string; name?: string; input?: unknown }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class MiniMaxProvider extends BaseProvider {
  readonly name: LLMProvider = 'minimax';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'MiniMax-M2.7',
      'abab6.5s-chat',
      'abab6.5-chat',
    ],
    maxContextLength: {
      'MiniMax-M2.7': 128000,
      'abab6.5s-chat': 245000,
      'abab6.5-chat': 245000,
    },
    maxOutputTokens: {
      'MiniMax-M2.7': 8192,
      'abab6.5s-chat': 8192,
      'abab6.5-chat': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: false,
    supportsAudio: true,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 300,
      tokensPerMinute: 300000,
      concurrentRequests: 30,
    },
    pricing: {
      'MiniMax-M2.7': {
        promptCostPer1k: 0.0004,
        completionCostPer1k: 0.0008,
        currency: 'USD',
      },
      'abab6.5s-chat': {
        promptCostPer1k: 0.0002,
        completionCostPer1k: 0.0004,
        currency: 'USD',
      },
      'abab6.5-chat': {
        promptCostPer1k: 0.0003,
        completionCostPer1k: 0.0006,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string = 'https://api.minimax.io/anthropic/v1';
  private headers: Record<string, string> = {};

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  protected async doInitialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new AuthenticationError('MiniMax API key is required', 'minimax');
    }

    this.baseUrl = this.config.apiUrl || 'https://api.minimax.io/anthropic/v1';
    this.headers = {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const apiRequest = this.buildRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(apiRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as AnthropicCompatibleResponse;
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
      const response = await fetch(`${this.baseUrl}/messages`, {
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

              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield {
                  type: 'content',
                  delta: { content: event.delta.text },
                };
              } else if (event.type === 'message_delta' && event.usage) {
                totalOutputTokens = event.usage.output_tokens;
              } else if (event.type === 'message_start' && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens;
              } else if (event.type === 'message_stop') {
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
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
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
      'MiniMax-M2.7': 'MiniMax M2.7 - Advanced multimodal model with audio support',
      'abab6.5s-chat': 'MiniMax abab6.5s - Fast and efficient chat model',
      'abab6.5-chat': 'MiniMax abab6.5 - Balanced performance chat model',
    };

    return {
      model,
      name: model,
      description: descriptions[model] || 'MiniMax model',
      contextLength: this.capabilities.maxContextLength[model] || 128000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 8192,
      supportedFeatures: ['chat', 'completion', 'tool_calling', 'audio'],
      pricing: this.capabilities.pricing[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
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

  private buildRequest(request: LLMRequest, stream = false): AnthropicCompatibleRequest {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const messages = otherMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));

    const apiRequest: AnthropicCompatibleRequest = {
      model: request.model || this.config.model,
      messages,
      max_tokens: request.maxTokens || this.config.maxTokens || 4096,
      stream,
    };

    if (systemMessage) {
      apiRequest.system = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : JSON.stringify(systemMessage.content);
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
      apiRequest.stop_sequences = request.stopSequences || this.config.stopSequences;
    }

    return apiRequest;
  }

  private transformResponse(data: AnthropicCompatibleResponse, request: LLMRequest): LLMResponse {
    const model = request.model || this.config.model;
    const pricing = this.capabilities.pricing[model];

    const promptCost = (data.usage.input_tokens / 1000) * (pricing?.promptCostPer1k || 0);
    const completionCost = (data.usage.output_tokens / 1000) * (pricing?.completionCostPer1k || 0);

    const textContent = data.content
      .map((c) => c.text || c.thinking || '')
      .join('');

    const toolCalls = data.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: `tool_${Date.now()}`,
        type: 'function' as const,
        function: {
          name: c.name || '',
          arguments: JSON.stringify(c.input || {}),
        },
      }));

    return {
      id: data.id,
      model: model as LLMModel,
      provider: 'minimax',
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: 'USD',
      },
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
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
        throw new AuthenticationError(message, 'minimax', errorData);
      case 429:
        throw new RateLimitError(message, 'minimax', undefined, errorData);
      default:
        throw new LLMProviderError(
          message,
          `MINIMAX_${response.status}`,
          'minimax',
          response.status,
          response.status >= 500,
          errorData
        );
    }
  }
}
