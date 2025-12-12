import type { LlmClient } from '@portfolio/chat-llm';
import type { ChatRequestMessage, ReasoningUpdate, UiPayload } from '@portfolio/chat-contract';
import type { ChatApi, ChatbotResponse, RunOptions } from './index';
import { moderateTextForProvider } from './moderation';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;
const DEFAULT_SOFT_TIMEOUT_MS = Number(process.env.CHAT_STREAM_TIMEOUT_MS ?? 65000);
const STREAM_TOKEN_CHUNK_SIZE = 32;

type StreamOptions = {
  anchorId?: string;
  runOptions?: RunOptions;
  onError?: (error: unknown) => void;
  outputModeration?: {
    enabled?: boolean;
    model?: string;
    refusalMessage?: string;
    refusalBanner?: string;
  };
  runtimeCost?: {
    onResult?: (result: ChatbotResponse) => Promise<{ level?: string } | void>;
    budgetExceededMessage?: string;
  };
};

const DEFAULT_OUTPUT_REFUSAL_MESSAGE =
  "I can't help with that request. I'm here to talk about my work, projects, and experience if you'd like.";
const DEFAULT_BUDGET_EXCEEDED_MESSAGE = 'Experiencing technical issues, try again later.';

export function createChatSseStream(
  api: ChatApi,
  client: LlmClient,
  messages: ChatRequestMessage[],
  options?: StreamOptions
) {
  const encoder = new TextEncoder();
  const anchorId =
    options?.anchorId ?? (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `assistant-${Date.now()}`);
  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  const softTimeoutMs = options?.runOptions?.softTimeoutMs ?? DEFAULT_SOFT_TIMEOUT_MS;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const moderationOptions = options?.outputModeration;
  const moderationEnabled = Boolean(moderationOptions?.enabled);
  const moderationModel = moderationOptions?.model;
  const refusalMessage = moderationOptions?.refusalMessage ?? DEFAULT_OUTPUT_REFUSAL_MESSAGE;
  const streamStartedAt = Date.now();

  const resetTimeout = () => {
    if (!Number.isFinite(softTimeoutMs) || softTimeoutMs <= 0) return;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandle = setTimeout(() => {
      abortController.abort();
      options?.onError?.(new Error('chat_stream_timeout'));
    }, softTimeoutMs);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (eventName: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      const chunkForStream = (value: string) => {
        if (!value) {
          return [] as string[];
        }
        if (value.length <= STREAM_TOKEN_CHUNK_SIZE) {
          return [value];
        }
        const parts: string[] = [];
        let cursor = 0;
        while (cursor < value.length) {
          parts.push(value.slice(cursor, cursor + STREAM_TOKEN_CHUNK_SIZE));
          cursor += STREAM_TOKEN_CHUNK_SIZE;
        }
        return parts;
      };
      const emitChunked = (value: string, emit: (chunk: string) => void) => {
        if (!value) return;
        const chunks = chunkForStream(value);
        for (const chunk of chunks) {
          if (!chunk) continue;
          emit(chunk);
        }
      };
      const sendErrorEvent = (
        code: string,
        message: string,
        retryable: boolean,
        retryAfterMs?: number,
        banner?: string,
        replacement?: string
      ) => {
        sendEvent('error', {
          type: 'error',
          anchorId,
          itemId: anchorId,
          code,
          message,
          retryable,
          retryAfterMs,
          banner,
          replacement,
        });
      };

      sendEvent('item', { type: 'item', itemId: anchorId, anchorId });
      resetTimeout();
      const bufferedTokens: string[] = [];
      const enqueueToken = (token: string) => {
        if (!token) return;
        resetTimeout();
        sendEvent('token', { type: 'token', token, itemId: anchorId, anchorId });
      };

      const enqueueReasoningEvent = (update?: ReasoningUpdate) => {
        if (!update) {
          return;
        }
        resetTimeout();
        sendEvent('reasoning', { type: 'reasoning', ...update, itemId: anchorId, anchorId });
      };
      type OnStageEvent = NonNullable<RunOptions['onStageEvent']>;
      const enqueueStageEvent = (
        stage: Parameters<OnStageEvent>[0],
        status: Parameters<OnStageEvent>[1],
        meta?: Record<string, unknown>,
        durationMs?: number
      ) => {
        resetTimeout();
        sendEvent('stage', { type: 'stage', stage, status, meta, durationMs, itemId: anchorId, anchorId });
      };
      const enqueueUiEvent = (ui: UiPayload | undefined) => {
        if (!ui) {
          return;
        }
        resetTimeout();
        sendEvent('ui', { type: 'ui', itemId: anchorId, anchorId, ui });
      };

      let truncationApplied = false;
      let errorEmitted = false;
      try {
        const upstreamRunOptions = options?.runOptions;
        let streamed = false;
        const handleToken = (token: string) => {
          if (!token) return;
          streamed = true;
          resetTimeout();
          if (moderationEnabled) {
            emitChunked(token, (chunk) => {
              bufferedTokens.push(chunk);
              enqueueToken(chunk);
            });
          } else {
            emitChunked(token, enqueueToken);
          }
          upstreamRunOptions?.onAnswerToken?.(token);
        };
        const result = await api.run(client, messages, {
          ...upstreamRunOptions,
          abortSignal,
          onAnswerToken: (token) => {
            handleToken(token);
          },
          onReasoningUpdate: (update) => {
            enqueueReasoningEvent(update);
            upstreamRunOptions?.onReasoningUpdate?.(update as unknown as ReasoningUpdate);
          },
          onUiEvent: (ui) => {
            enqueueUiEvent(ui);
            upstreamRunOptions?.onUiEvent?.(ui);
          },
          onStageEvent: (stage, status, meta, durationMs) => {
            enqueueStageEvent(stage, status, meta as Record<string, unknown> | undefined, durationMs);
            upstreamRunOptions?.onStageEvent?.(stage, status, meta as Record<string, unknown> | undefined, durationMs);
          },
        });
        truncationApplied = Boolean(result.truncationApplied);

        let budgetExceeded = false;
        if (options?.runtimeCost?.onResult) {
          try {
            const costState = await options.runtimeCost.onResult(result);
            if (costState && (costState as { level?: string }).level === 'exceeded') {
              budgetExceeded = true;
              errorEmitted = true;
              sendErrorEvent(
                'budget_exceeded',
                options.runtimeCost.budgetExceededMessage ?? DEFAULT_BUDGET_EXCEEDED_MESSAGE,
                false
              );
            }
          } catch (costError) {
            options?.onError?.(costError);
          }
        }

        if (budgetExceeded) {
          return;
        }

        if (result.error) {
          errorEmitted = true;
          sendErrorEvent(result.error.code, result.error.message, result.error.retryable, result.error.retryAfterMs);
          return;
        }

        resetTimeout();

        let blockedByModeration = false;
        if (moderationEnabled) {
          try {
            const textToModerate = (result.message || bufferedTokens.join('')).trim();
            if (textToModerate) {
              const moderation = await moderateTextForProvider(client, textToModerate, {
                model: moderationModel,
              });
              blockedByModeration = moderation.flagged;
            }
          } catch (error) {
            options?.onError?.(error);
          }
        }

        if (blockedByModeration) {
          errorEmitted = true;
          sendErrorEvent(
            'output_moderated',
            refusalMessage,
            false,
            undefined,
            moderationOptions?.refusalBanner,
            refusalMessage
          );
        } else {
          if (!streamed && result.message) {
            for (const chunk of chunkForStream(result.message)) {
              enqueueToken(chunk);
              // Yield so tokens and the completion event are delivered in separate ticks.
              await Promise.resolve();
            }
            streamed = true;
          }

          if (result.ui) {
            sendEvent('ui', {
              type: 'ui',
              itemId: anchorId,
              anchorId,
              ui: result.ui,
            });
          }

          if (Array.isArray(result.attachments)) {
            for (const attachment of result.attachments) {
              sendEvent('attachment', { type: 'attachment', attachment, itemId: anchorId, anchorId });
            }
          }

          sendEvent('ui_actions', { type: 'ui_actions', actions: [], itemId: anchorId, anchorId });
        }
      } catch (error) {
        const aborted = abortSignal.aborted;
        if (!aborted) {
          options?.onError?.(error);
        }
        const reason = (abortSignal as AbortSignal & { reason?: unknown }).reason;
        const reasonMessage =
          typeof reason === 'object' && reason && 'message' in reason ? String((reason as Error).message) : null;
        const code = aborted
          ? reasonMessage === 'soft_timeout'
            ? 'llm_timeout'
            : 'stream_interrupted'
          : 'internal_error';
        const message = code === 'llm_timeout' ? 'I ran out of time while composing a response.' : 'Chat unavailable';
        const retryable = code !== 'internal_error' || Boolean(aborted);
        errorEmitted = true;
        sendErrorEvent(code, message, retryable);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        const totalDurationMs = Date.now() - streamStartedAt;
        if (!errorEmitted) {
          // Defer completion to avoid batching the final token and done in the same tick.
          await Promise.resolve();
          sendEvent('done', {
            type: 'done',
            anchorId,
            itemId: anchorId,
            totalDurationMs,
            truncationApplied,
          });
        }
        controller.close();
      }
    },
    cancel(reason) {
      if (!abortSignal.aborted) {
        abortController.abort(reason instanceof Error ? reason : undefined);
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    },
  });
}
