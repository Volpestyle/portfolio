import type OpenAI from 'openai';
import type { ChatRequestMessage, ReasoningUpdate, UiPayload } from '@portfolio/chat-contract';
import type { PipelineStage, StageMeta, StageStatus } from '@portfolio/chat-orchestrator';
import {
  createChatRuntime,
  createRetrieval,
  type ChatbotResponse,
  type ChatRuntimeOptions,
} from '@portfolio/chat-orchestrator';
import type { RetrievalOptions } from '@portfolio/chat-orchestrator';

export type ChatApiConfig = {
  retrieval: RetrievalOptions;
  runtimeOptions?: ChatRuntimeOptions;
};

export type RunOptions = {
  onAnswerToken?: (token: string) => void;
  abortSignal?: AbortSignal;
  softTimeoutMs?: number;
  onReasoningUpdate?: (update: ReasoningUpdate) => void;
  ownerId?: string;
  reasoningEnabled?: boolean;
  onStageEvent?: (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => void;
  onUiEvent?: (ui: UiPayload) => void;
};

export type ChatApi = {
  run(client: OpenAI, messages: ChatRequestMessage[], options?: RunOptions): Promise<ChatbotResponse>;
};

const normalizeMinRelevanceScore = (value?: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

export function createChatApi(config: ChatApiConfig): ChatApi {
  const retrieval = createRetrieval(config.retrieval);
  const runtimeOptions: ChatRuntimeOptions = {
    ...(config.runtimeOptions ?? {}),
  };
  const normalizedMinRelevance = normalizeMinRelevanceScore(
    config.retrieval.minRelevanceScore ?? config.runtimeOptions?.retrieval?.minRelevanceScore
  );
  if (normalizedMinRelevance !== undefined) {
    runtimeOptions.retrieval = {
      ...(runtimeOptions.retrieval ?? {}),
      minRelevanceScore: normalizedMinRelevance,
    };
  }

  const runtime = createChatRuntime(retrieval, runtimeOptions);
  return {
    run(client, messages, options) {
      return runtime.run(client, messages, options);
    },
  };
}

export { createChatSseStream, SSE_HEADERS } from './stream';
export type { ChatbotResponse } from '@portfolio/chat-orchestrator';
export { createPortfolioChatServer } from './bootstrap';
export {
  createChatServerLogger,
  logChatDebug,
  getChatDebugLogs,
  resetChatDebugLogs,
  runWithChatLogContext,
  CHAT_DEBUG_LEVEL,
} from './server';
export type { ChatDebugLogEntry } from './server';
export { validateChatPostBody, resolveReasoningEnabled } from './validation';
export type { ChatPostBody } from './validation';
export { moderateChatMessages } from './moderation';
export type { ModerationResult } from './moderation';
export {
  getRuntimeCostClients,
  shouldThrottleForBudget,
  recordRuntimeCost,
  type RuntimeCostClients,
  type RuntimeCostState,
  type CostLevel,
} from './runtimeCost';
export { createNextChatHandler, type NextChatHandlerOptions } from './nextHandler';
export { createRateLimitEnforcer, type RateLimitResult } from './rateLimit';
