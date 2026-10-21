import { env } from '../env';
import { OpenAIProvider, type AIProviderConfig } from './OpenAIProvider';
import type { AIProvider } from './AIProvider';

export interface TenantAISettings {
  aiProvider: string | null;
  aiModel: string | null;
  aiTemperature: number | null;
}

/**
 * Models available to tenants, grouped by plan tier (Phase 4.5).
 * The `requiresEnv` key names the API key that must be configured.
 */
export const MODEL_CATALOG: Array<{
  id: string;
  label: string;
  provider: 'openai' | 'groq' | 'openrouter';
  tier: 'starter' | 'pro' | 'enterprise';
  requiresEnv: 'OPENAI_API_KEY' | 'GROQ_API_KEY' | 'OPENROUTER_API_KEY';
}> = [
  { id: 'openrouter/free', label: 'OpenRouter Free (Auto-Routed)', provider: 'openrouter', tier: 'starter', requiresEnv: 'OPENROUTER_API_KEY' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Groq, Default)', provider: 'groq', tier: 'starter', requiresEnv: 'GROQ_API_KEY' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai', tier: 'starter', requiresEnv: 'OPENAI_API_KEY' },
  { id: 'gpt-4o', label: 'GPT-4o (Best Quality)', provider: 'openai', tier: 'enterprise', requiresEnv: 'OPENAI_API_KEY' },
];

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Resolve the model a tenant should use, honouring the per-tenant override first,
 * then the platform default, then a safe fallback.
 */
export function resolveTenantModel(settings: TenantAISettings): {
  model: string;
  provider: 'openai' | 'groq' | 'openrouter';
  baseURL?: string;
  apiKey?: string;
  available: boolean;
} {
  const explicitProvider = (settings.aiProvider ?? 'auto') as 'auto' | 'openai' | 'groq' | 'openrouter';
  const explicitModel = settings.aiModel ?? null;

  const getBaseUrl = (prov: string) => {
    if (prov === 'groq') return GROQ_BASE_URL;
    if (prov === 'openrouter') return OPENROUTER_BASE_URL;
    return undefined;
  };

  // 1. Explicit per-tenant selection.
  if (explicitModel) {
    const entry = MODEL_CATALOG.find((m) => m.id === explicitModel);
    if (entry) {
      const key = process.env[entry.requiresEnv];
      if (key) {
        return {
          model: entry.id,
          provider: entry.provider,
          baseURL: getBaseUrl(entry.provider),
          apiKey: key,
          available: true,
        };
      }
    }
  }

  // 2. Tenant pinned to a provider but no model — use that provider's default.
  if (explicitProvider !== 'auto') {
    const entry = MODEL_CATALOG.find((m) => m.provider === explicitProvider);
    const key = entry ? process.env[entry.requiresEnv] : undefined;
    if (entry && key) {
      return {
        model: entry.id,
        provider: entry.provider,
        baseURL: getBaseUrl(entry.provider),
        apiKey: key,
        available: true,
      };
    }
  }

  // 3. Platform default, then the first configured provider.
  if (env.AI_MODEL) {
    const provider = env.AI_PROVIDER === 'auto' ? inferProvider(env.AI_MODEL) : env.AI_PROVIDER as 'openai' | 'groq' | 'openrouter';
    const key = process.env[provider === 'openrouter' ? 'OPENROUTER_API_KEY' : provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'];
    if (key) {
      return {
        model: env.AI_MODEL,
        provider,
        baseURL: env.AI_BASE_URL ?? getBaseUrl(provider),
        apiKey: key,
        available: true,
      };
    }
  }

  for (const entry of MODEL_CATALOG) {
    const key = process.env[entry.requiresEnv];
    if (key) {
      return {
        model: entry.id,
        provider: entry.provider,
        baseURL: getBaseUrl(entry.provider),
        apiKey: key,
        available: true,
      };
    }
  }

  return { model: 'gpt-4o-mini', provider: 'openai', available: false };
}

function inferProvider(model: string): 'openai' | 'groq' | 'openrouter' {
  const entry = MODEL_CATALOG.find((m) => m.id === model);
  if (entry) return entry.provider;
  if (model.includes('openrouter')) return 'openrouter';
  return /llama|gemma|mixtral/.test(model) ? 'groq' : 'openai';
}

/**
 * Build an AI provider for a tenant. Returns null when no LLM key is configured
 * so callers can degrade gracefully instead of throwing on every message.
 */
export function createProviderForTenant(settings: TenantAISettings): AIProvider | null {
  const resolved = resolveTenantModel(settings);
  if (!resolved.available || !resolved.apiKey) return null;

  const config: AIProviderConfig = {
    apiKey: resolved.apiKey,
    model: resolved.model,
    ...(resolved.baseURL ? { baseURL: resolved.baseURL } : {}),
    temperature: settings.aiTemperature ?? 0.2,
  };

  return new OpenAIProvider(config);
}

/** Catalogue for the settings UI, flagging which models are actually usable. */
export function availableModelCatalog() {
  return MODEL_CATALOG.map((entry) => ({
    ...entry,
    available: Boolean(process.env[entry.requiresEnv]),
  }));
}
