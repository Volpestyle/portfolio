import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ChatRuntimeOptions } from '@portfolio/chat-orchestrator';
import {
  RETRIEVAL_REQUEST_TOPK_MAX,
  type ModelConfig,
  type StageReasoningConfig,
} from '@portfolio/chat-contract';

type RetrievalWeightsConfig = {
  textWeight?: number;
  semanticWeight?: number;
  recencyLambda?: number;
};

export type ChatConfig = {
  /**
   * LLM provider for planner/answer runtime.
   * - openai: OpenAI Responses API (current default)
   * - anthropic: Claude models via Anthropic Messages API
   */
  provider?: 'openai' | 'anthropic';
  models?: {
    default?: string;
    plannerModel?: string;
    answerModel?: string;
    answerModelNoRetrieval?: string;
    embeddingModel?: string;
    reasoning?: StageReasoningConfig;
    answerTemperature?: number;
  };
  tokens?: {
    planner?: number;
    answer?: number;
  };
  retrieval?: {
    defaultTopK?: number;
    maxTopK?: number;
    minRelevanceScore?: number;
    weights?: RetrievalWeightsConfig;
  };
  moderation?: {
    input?: {
      enabled?: boolean;
      model?: string;
    };
    output?: {
      enabled?: boolean;
      model?: string;
      refusalMessage?: string;
      refusalBanner?: string;
    };
  };
  cost?: {
    budgetUsd?: number;
  };
};

export type ResolvedModerationOptions = {
  input?: {
    enabled?: boolean;
    model?: string;
  };
  output?: {
    enabled?: boolean;
    model?: string;
    refusalMessage?: string;
    refusalBanner?: string;
  };
};

const DEFAULT_CONFIG_FILES = ['chat.config.yml', 'chat.config.yaml', 'chat.config.json'];
const PREPROCESS_CONFIG_FILES = [
  'chat-preprocess.config.yml',
  'chat-preprocess.config.yaml',
  'chat-preprocess.config.json',
];
export const DEFAULT_RESUME_FILENAME = 'resume.pdf';

type PreprocessConfig = {
  models?: {
    embeddingModel?: string;
    projectEmbeddingModel?: string;
    resumeEmbeddingModel?: string;
  };
  resume?: {
    filename?: string;
  };
};

function readConfigFile(filePath: string): ChatConfig | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (ext === '.json') {
    return JSON.parse(raw) as ChatConfig;
  }
  if (ext === '.yml' || ext === '.yaml') {
    return YAML.parse(raw) as ChatConfig;
  }
  return undefined;
}

export function loadChatConfig(): ChatConfig | undefined {
  const cwd = process.cwd();
  for (const candidate of DEFAULT_CONFIG_FILES) {
    const absolute = path.resolve(cwd, candidate);
    if (fs.existsSync(absolute)) {
      return readConfigFile(absolute);
    }
  }
  return undefined;
}

function loadPreprocessConfig(): PreprocessConfig | undefined {
  const cwd = process.cwd();
  for (const candidate of PREPROCESS_CONFIG_FILES) {
    const absolute = path.resolve(cwd, candidate);
    if (fs.existsSync(absolute)) {
      return readConfigFile(absolute) as PreprocessConfig;
    }
  }
  return undefined;
}

function normalizeTemperature(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const clamped = Math.min(2, Math.max(0, value));
  return clamped;
}

function trimModelConfig(config?: Partial<ModelConfig>): Partial<ModelConfig> | undefined {
  if (!config) return undefined;
  const entries = Object.entries(config).filter(([key, value]) => {
    // Keep non-empty strings for model names
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return true;
    }
    // Keep reasoning object if it has any defined values
    if (key === 'reasoning' && value && typeof value === 'object') {
      return Object.values(value).some((v) => v !== undefined);
    }
    return false;
  });
  if (!entries.length) {
    return undefined;
  }
  return Object.fromEntries(entries) as Partial<ModelConfig>;
}

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  return undefined;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeProvider = (value: unknown): 'openai' | 'anthropic' | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  return undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value > 0 ? value : undefined;
};

export function resolveChatModelConfig(config?: ChatConfig): Partial<ModelConfig> | undefined {
  if (!config?.models) return undefined;
  const base = config.models.default;
  const preprocess = loadPreprocessConfig();
  const resolveEmbedding = (): string | undefined => {
    const explicit = config.models?.embeddingModel;
    if (explicit?.trim()) {
      return explicit.trim();
    }
    if (preprocess?.models?.embeddingModel?.trim()) {
      return preprocess.models.embeddingModel.trim();
    }
    const project = preprocess?.models?.projectEmbeddingModel?.trim();
    const resume = preprocess?.models?.resumeEmbeddingModel?.trim();
    if (project && resume && project !== resume) {
      // Differing preprocess embeddings; prefer project for consistency rather than silently choosing at random.
      return project;
    }
    return project ?? resume ?? undefined;
  };
  const answerModel = config.models.answerModel ?? base;
  if (!answerModel?.trim()) {
    throw new Error('chat.config.yml is missing models.answerModel');
  }
  const plannerModel = config.models.plannerModel ?? answerModel;
  const answerModelNoRetrieval = config.models.answerModelNoRetrieval ?? undefined;

  const reasoning: StageReasoningConfig | undefined = config.models.reasoning
    ? {
      planner: config.models.reasoning.planner,
      answer: config.models.reasoning.answer,
      answerNoRetrieval: config.models.reasoning.answerNoRetrieval,
    }
    : undefined;

  return trimModelConfig({
    plannerModel,
    answerModel,
    answerModelNoRetrieval: answerModelNoRetrieval?.trim(),
    embeddingModel: resolveEmbedding(),
    reasoning,
    answerTemperature: normalizeTemperature(config.models.answerTemperature),
  });
}

export function resolveCostBudget(config?: ChatConfig): number | undefined {
  return normalizeNumber(config?.cost?.budgetUsd);
}

export function resolveChatProvider(config?: ChatConfig): 'openai' | 'anthropic' {
  return normalizeProvider(config?.provider) ?? 'openai';
}

export function resolveChatRuntimeOptions(config?: ChatConfig): ChatRuntimeOptions | undefined {
  if (!config) return undefined;
  const modelConfig = resolveChatModelConfig(config);
  const tokenLimits = config.tokens;
  const runtime: ChatRuntimeOptions = {};
  if (process.env.CHAT_LOG_PROMPTS === '1' || process.env.CHAT_LOG_PROMPTS === 'true') {
    runtime.logPrompts = true;
  }
  if (modelConfig) {
    runtime.modelConfig = modelConfig;
  }
  if (tokenLimits) {
    runtime.tokenLimits = tokenLimits;
  }
  return Object.keys(runtime).length ? runtime : undefined;
}

export function resolveModerationOptions(config?: ChatConfig): ResolvedModerationOptions | undefined {
  if (!config?.moderation) return undefined;
  const normalized: ResolvedModerationOptions = {};
  const inputEnabled = normalizeBoolean(config.moderation.input?.enabled);
  const inputModel = normalizeString(config.moderation.input?.model);
  if (inputEnabled !== undefined || inputModel) {
    normalized.input = {};
    if (inputEnabled !== undefined) normalized.input.enabled = inputEnabled;
    if (inputModel) normalized.input.model = inputModel;
  }

  const outputEnabled = normalizeBoolean(config.moderation.output?.enabled);
  const outputModel = normalizeString(config.moderation.output?.model);
  const refusalMessage = normalizeString(config.moderation.output?.refusalMessage);
  const refusalBanner = normalizeString(config.moderation.output?.refusalBanner);
  if (outputEnabled !== undefined || outputModel || refusalMessage || refusalBanner) {
    normalized.output = {};
    if (outputEnabled !== undefined) normalized.output.enabled = outputEnabled;
    if (outputModel) normalized.output.model = outputModel;
    if (refusalMessage) normalized.output.refusalMessage = refusalMessage;
    if (refusalBanner) normalized.output.refusalBanner = refusalBanner;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

const clampTopK = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (Number.isNaN(normalized)) return undefined;
  return Math.max(1, Math.min(RETRIEVAL_REQUEST_TOPK_MAX, normalized));
};

const normalizeWeight = (value?: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0) {
    return undefined;
  }
  return Math.min(5, value);
};

const normalizeRetrievalWeights = (weights?: RetrievalWeightsConfig): RetrievalWeightsConfig | undefined => {
  if (!weights) {
    return undefined;
  }
  const normalized: RetrievalWeightsConfig = {};
  const text = normalizeWeight(weights.textWeight);
  const semantic = normalizeWeight(weights.semanticWeight);
  const recencyLambda = normalizeWeight(weights.recencyLambda);
  if (text !== undefined) normalized.textWeight = text;
  if (semantic !== undefined) normalized.semanticWeight = semantic;
  if (recencyLambda !== undefined) normalized.recencyLambda = recencyLambda;
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeMinRelevanceScore = (value?: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

export function resolveRetrievalOverrides(
  config?: ChatConfig
): { defaultTopK?: number; maxTopK?: number; minRelevanceScore?: number; weights?: RetrievalWeightsConfig } | undefined {
  if (!config?.retrieval) return undefined;
  const rawDefault = clampTopK(config.retrieval.defaultTopK);
  const rawMax = clampTopK(config.retrieval.maxTopK);
  const maxTopK = rawMax ?? RETRIEVAL_REQUEST_TOPK_MAX;
  const defaultTopK = Math.min(rawDefault ?? maxTopK, maxTopK);
  const overrides: { defaultTopK?: number; maxTopK?: number; minRelevanceScore?: number; weights?: RetrievalWeightsConfig } = {};
  if (rawMax !== undefined) overrides.maxTopK = maxTopK;
  if (rawDefault !== undefined) overrides.defaultTopK = defaultTopK;
  const minRelevanceScore = normalizeMinRelevanceScore(config.retrieval.minRelevanceScore);
  if (minRelevanceScore !== undefined) {
    overrides.minRelevanceScore = minRelevanceScore;
  }
  const weights = normalizeRetrievalWeights(config.retrieval.weights);
  if (weights) {
    overrides.weights = weights;
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

export function resolveResumeFilename(): string {
  const preprocess = loadPreprocessConfig();
  const filename = preprocess?.resume?.filename?.trim();
  if (filename && filename.length > 0) {
    return filename;
  }
  return DEFAULT_RESUME_FILENAME;
}
