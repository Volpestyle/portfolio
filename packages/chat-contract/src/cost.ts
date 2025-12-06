export const TOKENS_PER_THOUSAND = 1000;
export const TOKENS_PER_MILLION = 1_000_000;
export const DEFAULT_COST_DECIMAL_PLACES = 6;

export type TokenUnit = typeof TOKENS_PER_THOUSAND | typeof TOKENS_PER_MILLION;

export type Price = {
  amount: number;
  perTokens: TokenUnit;
};

export type ModelPricing = {
  prompt: Price;
  completion: Price;
};

export type NormalizedModelPricing = {
  prompt: number;
  completion: number;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const PROMPT_TOKEN_KEYS = ['prompt_tokens', 'promptTokens', 'input_tokens'] as const;
const COMPLETION_TOKEN_KEYS = ['completion_tokens', 'completionTokens', 'output_tokens'] as const;
const MODEL_SUFFIXES = ['-latest', '-preview'] as const;
const ISO_DATE_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;

// Pricing in USD per 1M tokens to mirror OpenAI public pricing.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.1': {
    prompt: { amount: 1.25, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 10, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-5-pro': {
    prompt: { amount: 15, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 120, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-5-mini': {
    prompt: { amount: 0.25, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 2, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-5-nano': {
    prompt: { amount: 0.05, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 0.4, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4.1': {
    prompt: { amount: 2.75, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 11, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4o': {
    prompt: { amount: 2.5, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 10, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4o-mini': {
    prompt: { amount: 0.15, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 0.6, perTokens: TOKENS_PER_MILLION },
  },
  // gpt-4.1-nano is priced like 4o-mini; keep keyed so dated variants resolve to this entry.
  'gpt-4.1-nano': {
    prompt: { amount: 0.15, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 0.6, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4-turbo': {
    prompt: { amount: 10, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 30, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4': {
    prompt: { amount: 30, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 60, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4-0613': {
    prompt: { amount: 30, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 60, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-4-32k': {
    prompt: { amount: 60, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 120, perTokens: TOKENS_PER_MILLION },
  },
  'gpt-3.5-turbo': {
    prompt: { amount: 0.5, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 1.5, perTokens: TOKENS_PER_MILLION },
  },
  'o1-preview': {
    prompt: { amount: 15, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 60, perTokens: TOKENS_PER_MILLION },
  },
  o1: {
    prompt: { amount: 15, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 60, perTokens: TOKENS_PER_MILLION },
  },
  'o1-mini': {
    prompt: { amount: 3, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 12, perTokens: TOKENS_PER_MILLION },
  },
  'text-embedding-3-large': {
    prompt: { amount: 0.13, perTokens: TOKENS_PER_MILLION },
    completion: { amount: 0, perTokens: TOKENS_PER_MILLION },
  },
};

export const MODEL_ALIASES: Record<string, string> = {
  'gpt-5-mini-2025-08-07': 'gpt-5-mini',
  'gpt-5-nano-2025-08-07': 'gpt-5-nano',
  'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-2024-08-06': 'gpt-4o',
  'gpt-4o-2024-05-13': 'gpt-4o',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
  'gpt-4.1-nano-2025-04-14': 'gpt-4.1-nano',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106': 'gpt-3.5-turbo',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceTokenCount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  return null;
}

function pickTokenCount(record: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const parsed = coerceTokenCount(record[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return 0;
}

export type ParseUsageOptions = {
  allowZero?: boolean;
};

export function parseUsage(usageCandidate: unknown, options: ParseUsageOptions = {}): TokenUsage | null {
  if (!isRecord(usageCandidate)) {
    return options.allowZero ? { promptTokens: 0, completionTokens: 0, totalTokens: 0 } : null;
  }

  const promptTokens = pickTokenCount(usageCandidate, PROMPT_TOKEN_KEYS);
  const completionTokens = pickTokenCount(usageCandidate, COMPLETION_TOKEN_KEYS);
  const totalTokens = promptTokens + completionTokens;

  if (!options.allowZero && totalTokens <= 0) {
    return null;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function isModelSuffix(model: string): boolean {
  return MODEL_SUFFIXES.some((suffix) => model.endsWith(suffix));
}

function stripModelSuffix(model: string): string {
  if (isModelSuffix(model)) {
    return model.replace(/-(latest|preview)$/, '');
  }
  if (ISO_DATE_SUFFIX.test(model)) {
    return model.replace(ISO_DATE_SUFFIX, '');
  }
  return model;
}

export function resolveModelKey(model?: string | null): string | null {
  if (!model) return null;
  const normalized = stripModelSuffix(model);
  return MODEL_ALIASES[normalized] ?? normalized;
}

function ratePerThousand(price: Price): number {
  return price.perTokens === TOKENS_PER_THOUSAND
    ? price.amount
    : (price.amount / price.perTokens) * TOKENS_PER_THOUSAND;
}

const NORMALIZED_PRICING_CACHE = new Map<string, NormalizedModelPricing>();

export function getNormalizedPricing(model?: string | null): NormalizedModelPricing | null {
  if (!model) {
    return null;
  }
  const key = resolveModelKey(model);
  if (!key) return null;

  const cached = NORMALIZED_PRICING_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const pricing = MODEL_PRICING[key];
  if (!pricing) {
    return null;
  }

  const normalized = {
    prompt: ratePerThousand(pricing.prompt),
    completion: ratePerThousand(pricing.completion),
  };
  NORMALIZED_PRICING_CACHE.set(key, normalized);
  return normalized;
}

export function calculateCost(usage: TokenUsage, pricing: NormalizedModelPricing): number {
  const promptCost = (usage.promptTokens / TOKENS_PER_THOUSAND) * pricing.prompt;
  const completionCost = (usage.completionTokens / TOKENS_PER_THOUSAND) * pricing.completion;
  return promptCost + completionCost;
}

export type EstimateCostOptions = {
  fallbackPricing?: NormalizedModelPricing | null;
  decimalPlaces?: number;
};

export function estimateCostUsd(
  model: string | undefined | null,
  usage: TokenUsage,
  options: EstimateCostOptions = {}
): number | null {
  const pricing = getNormalizedPricing(model) ?? options.fallbackPricing;
  if (!pricing) {
    return null;
  }

  const cost = calculateCost(usage, pricing);
  if (!Number.isFinite(cost)) {
    return null;
  }

  const decimalPlaces = options.decimalPlaces ?? DEFAULT_COST_DECIMAL_PLACES;
  return Number(cost.toFixed(decimalPlaces));
}
