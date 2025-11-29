import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import type OpenAI from 'openai';
import { createChatSseStream, SSE_HEADERS } from './stream';
import { validateChatPostBody, resolveReasoningEnabled, type ChatPostBody } from './validation';
import { moderateChatMessages } from './moderation';
import {
  logChatDebug,
  resetChatDebugLogs,
  runWithChatLogContext,
  type ChatServerLogger,
} from './server';
import type { ChatApi } from './index';
import type { ChatRuntimeOptions } from '@portfolio/chat-orchestrator';
import type { RuntimeCostClients, RuntimeCostState } from './runtimeCost';

type RateLimitResult = {
  success: boolean;
  reason?: string;
  reset?: number;
  headers?: HeadersInit;
  status?: number;
};

type FixtureResponder = (options: { answerModel: string; headers?: HeadersInit }) => Promise<Response> | Response;

type RuntimeCostHooks = {
  getClients: (ownerId: string) => Promise<RuntimeCostClients | null>;
  shouldThrottleForBudget: (clients: RuntimeCostClients, logger?: ChatServerLogger) => Promise<RuntimeCostState>;
  recordRuntimeCost: (clients: RuntimeCostClients, costUsd: number, logger?: ChatServerLogger) => Promise<RuntimeCostState>;
  budgetExceededMessage?: string;
};

export type NextChatHandlerOptions = {
  chatApi: ChatApi;
  chatOwnerId: string;
  chatLogger: ChatServerLogger;
  chatRuntimeOptions?: ChatRuntimeOptions;
  getOpenAIClient: () => Promise<OpenAI>;
  enforceRateLimit?: (request: NextRequest) => Promise<RateLimitResult>;
  buildRateLimitHeaders?: (result: RateLimitResult) => HeadersInit;
  shouldServeFixtures?: (headers: Headers) => boolean;
  buildFixtureResponse?: FixtureResponder;
  inputModeration?: {
    enabled?: boolean;
    model?: string;
  };
  outputModeration?: {
    enabled?: boolean;
    model?: string;
    refusalMessage?: string;
    refusalBanner?: string;
  };
  runtimeCost?: RuntimeCostHooks;
  onErrorLog?: (event: string, payload: Record<string, unknown>) => void;
};

const DEFAULT_MODERATION_REFUSAL_MESSAGE =
  'I can only answer questions about my portfolio and professional background.';
const DEFAULT_MODERATION_REFUSAL_BANNER = 'That request was blocked by my safety filters.';
const DEFAULT_BUDGET_EXCEEDED_MESSAGE = 'Experiencing technical issues, try again later.';

function buildErrorSseResponse({
  code,
  message,
  retryable,
  retryAfterMs,
  headers,
  status,
  anchorId,
}: {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  headers?: HeadersInit;
  status?: number;
  anchorId?: string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            anchorId,
            itemId: anchorId,
            code,
            message,
            retryable,
            retryAfterMs,
          })}\n\n`
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status: status ?? (retryable ? 429 : 503),
    headers: { ...SSE_HEADERS, ...(headers ?? {}) },
  });
}

export function createNextChatHandler(options: NextChatHandlerOptions) {
  const answerModel = options.chatRuntimeOptions?.modelConfig?.answerModel;
  if (!answerModel) {
    throw new Error('Missing modelConfig.answerModel in chat config.');
  }
  const outputModeration = {
    enabled: options.outputModeration?.enabled ?? process.env.CHAT_OUTPUT_MODERATION_ENABLED === 'true',
    model: options.outputModeration?.model ?? process.env.CHAT_OUTPUT_MODERATION_MODEL,
    refusalMessage: options.outputModeration?.refusalMessage ?? DEFAULT_MODERATION_REFUSAL_MESSAGE,
    refusalBanner: options.outputModeration?.refusalBanner ?? DEFAULT_MODERATION_REFUSAL_BANNER,
  };
  const inputModeration = {
    enabled: options.inputModeration?.enabled ?? true,
    model: options.inputModeration?.model,
  };
  const budgetExceededMessage = options.runtimeCost?.budgetExceededMessage ?? DEFAULT_BUDGET_EXCEEDED_MESSAGE;

  return {
    async POST(request: NextRequest): Promise<Response> {
      const correlationId = randomUUID();
      const body = ((await request.json()) as ChatPostBody) ?? {};
      const validation = validateChatPostBody(body, options.chatOwnerId);
      if (!validation.ok) {
        return new Response(validation.error, { status: validation.status });
      }
      const {
        messages,
        responseAnchorId,
        ownerId,
        reasoningEnabled: requestedReasoningEnabled,
        conversationId,
      } = validation.value;

      return runWithChatLogContext({ correlationId, conversationId }, async () => {
        const reasoningEnabled = resolveReasoningEnabled({
          requested: requestedReasoningEnabled,
          environment: process.env.NODE_ENV,
        });

        if (process.env.NODE_ENV !== 'production' && messages.length === 1) {
          resetChatDebugLogs();
        }

        const rateLimit = options.enforceRateLimit ? await options.enforceRateLimit(request) : null;
        const rateLimitHeaders = rateLimit
          ? options.buildRateLimitHeaders
            ? options.buildRateLimitHeaders(rateLimit)
            : rateLimit.headers ?? {}
          : {};
        if (rateLimit && !rateLimit.success) {
          const status = rateLimit.status
            ?? (rateLimit.reason === 'Rate limiter unavailable'
              ? 503
              : rateLimit.reason === 'Unable to identify client IP'
                ? 400
                : 429);
          const retryAfterMs =
            typeof rateLimit.reset === 'number' && Number.isFinite(rateLimit.reset)
              ? Math.max(0, rateLimit.reset * 1000 - Date.now())
              : undefined;
          return buildErrorSseResponse({
            code: 'rate_limited',
            message: rateLimit.reason ?? 'Rate limit exceeded',
            retryable: true,
            retryAfterMs,
            headers: rateLimitHeaders,
            status,
            anchorId: responseAnchorId,
          });
        }

        const runtimeCostClients = options.runtimeCost ? await options.runtimeCost.getClients(ownerId) : null;
        if (runtimeCostClients && options.runtimeCost) {
          try {
            const costState = await options.runtimeCost.shouldThrottleForBudget(runtimeCostClients, options.chatLogger);
            if (costState.level === 'exceeded') {
              return buildErrorSseResponse({
                code: 'budget_exceeded',
                message: budgetExceededMessage,
                retryable: false,
                status: 503,
                headers: rateLimitHeaders,
                anchorId: responseAnchorId,
              });
            }
          } catch (error) {
            logChatDebug('api.chat.cost_check_error', { error: String(error), correlationId });
          }
        }

        if (options.shouldServeFixtures && options.buildFixtureResponse) {
          const shouldServe = options.shouldServeFixtures(request.headers);
          if (shouldServe) {
            return options.buildFixtureResponse({ answerModel, headers: rateLimitHeaders });
          }
        }

        try {
          const client = await options.getOpenAIClient();
          if (inputModeration.enabled) {
            const moderation = await moderateChatMessages(client, messages, { model: inputModeration.model });
            if (moderation.flagged) {
              logChatDebug('api.chat.moderation_blocked', {
                categories: moderation.categories ?? [],
                correlationId,
              });
              return Response.json(
                { error: { code: 'input_moderated', message: outputModeration.refusalMessage, retryable: false } },
                { status: 200, headers: rateLimitHeaders }
              );
            }
          }
          const stream = createChatSseStream(options.chatApi, client, messages, {
            anchorId: responseAnchorId,
            runOptions: { ownerId, reasoningEnabled },
            outputModeration: outputModeration.enabled
              ? {
                  enabled: outputModeration.enabled,
                  model: outputModeration.model,
                  refusalMessage: outputModeration.refusalMessage,
                  refusalBanner: outputModeration.refusalBanner,
                }
              : undefined,
            runtimeCost: runtimeCostClients && options.runtimeCost
              ? {
                  budgetExceededMessage,
                  onResult: async (result) => {
                    const fromUsage = Array.isArray(result.usage)
                      ? result.usage.reduce((acc, entry) => acc + (entry?.costUsd ?? 0), 0)
                      : 0;
                    const costUsd = typeof result.totalCostUsd === 'number' ? result.totalCostUsd : fromUsage;
                    try {
                      return await options.runtimeCost!.recordRuntimeCost(runtimeCostClients, costUsd, options.chatLogger);
                    } catch (error) {
                      logChatDebug('api.chat.cost_record_error', { error: String(error), correlationId });
                      return undefined;
                    }
                  },
                }
              : undefined,
            onError: (error: unknown) => logChatDebug('api.chat.pipeline_error', { error: String(error), correlationId }),
          });
          return new Response(stream, { headers: { ...SSE_HEADERS, ...rateLimitHeaders } });
        } catch (error) {
          logChatDebug('api.chat.error', { error: String(error), correlationId });
          options.onErrorLog?.('api.chat.error', { error: String(error), correlationId });
          return new Response('Chat unavailable', { status: 500 });
        }
      });
    },
  };
}
