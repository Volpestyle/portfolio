import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ChatRuntimeOptions } from '@portfolio/chat-orchestrator';
import {
  RETRIEVAL_REQUEST_TOPK_MAX,
  type OwnerConfig,
  type ModelConfig,
  type StageReasoningConfig,
} from '@portfolio/chat-contract';

export type ChatConfig = {
  owner?: OwnerConfig;
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
  if (config.owner) {
    runtime.owner = config.owner;
  }
  return Object.keys(runtime).length ? runtime : undefined;
}

const clampTopK = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (Number.isNaN(normalized)) return undefined;
  return Math.max(1, Math.min(RETRIEVAL_REQUEST_TOPK_MAX, normalized));
};

export function resolveRetrievalOverrides(
  config?: ChatConfig
): { defaultTopK?: number; maxTopK?: number } | undefined {
  if (!config?.retrieval) return undefined;
  const rawDefault = clampTopK(config.retrieval.defaultTopK);
  const rawMax = clampTopK(config.retrieval.maxTopK);
  const maxTopK = rawMax ?? RETRIEVAL_REQUEST_TOPK_MAX;
  const defaultTopK = Math.min(rawDefault ?? maxTopK, maxTopK);
  const overrides: { defaultTopK?: number; maxTopK?: number } = {};
  if (rawMax !== undefined) overrides.maxTopK = maxTopK;
  if (rawDefault !== undefined) overrides.defaultTopK = defaultTopK;
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
