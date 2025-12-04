import type OpenAI from 'openai';
import type { ChatRequestMessage, PartialReasoningTrace, ReasoningStage, UiPayload } from '@portfolio/chat-contract';
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
  onReasoningUpdate?: (stage: ReasoningStage, trace: PartialReasoningTrace) => void;
  ownerId?: string;
  reasoningEnabled?: boolean;
  onStageEvent?: (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => void;
  onUiEvent?: (ui: UiPayload) => void;
};

export type ChatApi = {
  run(client: OpenAI, messages: ChatRequestMessage[], options?: RunOptions): Promise<ChatbotResponse>;
};

export function createChatApi(config: ChatApiConfig): ChatApi {
  const retrieval = createRetrieval(config.retrieval);
  const runtime = createChatRuntime(retrieval, config.runtimeOptions);
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
