import OpenAI from 'openai';
import { AIProvider, AIProviderContext, AIResponse } from './AIProvider';

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  temperature?: number;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;

  constructor(apiKeyOrConfig: string | AIProviderConfig, model: string = 'gpt-4o-mini') {
    if (typeof apiKeyOrConfig === 'string') {
      const isGroqKey = apiKeyOrConfig.startsWith('gsk_') || process.env.GROQ_API_KEY === apiKeyOrConfig;
      const defaultBaseUrl = isGroqKey ? 'https://api.groq.com/openai/v1' : undefined;
      const defaultModel = isGroqKey ? 'llama-3.3-70b-versatile' : model;

      this.client = new OpenAI({
        apiKey: apiKeyOrConfig,
        baseURL: process.env.AI_BASE_URL || defaultBaseUrl,
      });
      this.model = process.env.AI_MODEL || defaultModel;
      this.temperature = 0.2;
    } else {
      this.client = new OpenAI({
        apiKey: apiKeyOrConfig.apiKey,
        baseURL: apiKeyOrConfig.baseURL || process.env.AI_BASE_URL,
      });
      this.model = apiKeyOrConfig.model || process.env.AI_MODEL || 'gpt-4o-mini';
      this.temperature = apiKeyOrConfig.temperature ?? 0.2;
    }
  }

  async generateResponse(ctx: AIProviderContext): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: ctx.messages as any,
        tools: ctx.tools,
        temperature: this.temperature,
      });

      const message = response.choices[0]?.message;

      return {
        message: {
          role: (message?.role as any) || 'assistant',
          content: message?.content || '',
          tool_calls: message?.tool_calls,
        },
        rawResponse: response,
      };
    } catch (err: any) {
      console.error('LLM API Error:', err.message);
      throw new Error(`AI Provider invocation failed: ${err.message}`);
    }
  }
}

