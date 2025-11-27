import type OpenAI from 'openai';
import type { ChatRequestMessage, PartialReasoningTrace, ReasoningStage, UiPayload } from '@portfolio/chat-contract';
import { chunkText } from '@portfolio/chat-contract';
import type { ChatApi, ChatbotResponse, RunOptions } from './index';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;
const DEFAULT_SOFT_TIMEOUT_MS = Number(process.env.CHAT_STREAM_TIMEOUT_MS ?? 65000);

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

export const DEFAULT_OUTPUT_REFUSAL_MESSAGE =
  "I can't help with that request. I'm here to talk about my work, projects, and experience if you'd like.";
export const DEFAULT_OUTPUT_REFUSAL_BANNER = 'That response was blocked by my safety filters.';
export const DEFAULT_BUDGET_EXCEEDED_MESSAGE = 'Experiencing technical issues, try again later.';

export function createChatSseStream(api: ChatApi, client: OpenAI, messages: ChatRequestMessage[], options?: StreamOptions) {
  const encoder = new TextEncoder();
  const anchorId =
    options?.anchorId ??
    (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `assistant-${Date.now()}`);
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
      const sendErrorEvent = (code: string, message: string, retryable: boolean, retryAfterMs?: number) => {
        sendEvent('error', { type: 'error', anchorId, itemId: anchorId, code, message, retryable, retryAfterMs });
      };

      sendEvent('item', { type: 'item', itemId: anchorId, anchorId });
      resetTimeout();
      const bufferedTokens: string[] = [];
      const enqueueToken = (token: string) => {
        if (!token) return;
        resetTimeout();
        sendEvent('token', { type: 'token', token, itemId: anchorId, anchorId });
      };

      const enqueueReasoningEvent = (stage: ReasoningStage, trace: PartialReasoningTrace | undefined) => {
        if (!trace) {
          return;
        }
        resetTimeout();
        sendEvent('reasoning', { type: 'reasoning', stage, trace, itemId: anchorId, anchorId });
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
        let streamed = false;
        const upstreamRunOptions = options?.runOptions;
        const bufferToken = (token: string) => {
          if (!token) return;
          streamed = true;
          bufferedTokens.push(token);
          upstreamRunOptions?.onAnswerToken?.(token);
        };
        const streamToken = (token: string) => {
          if (!token) return;
          streamed = true;
          enqueueToken(token);
          upstreamRunOptions?.onAnswerToken?.(token);
        };
        const result = await api.run(client, messages, {
          ...upstreamRunOptions,
          abortSignal,
          onAnswerToken: (token) => {
            if (moderationEnabled) {
              bufferToken(token);
              return;
            }
            streamToken(token);
          },
          onReasoningUpdate: (stage, trace) => {
            enqueueReasoningEvent(stage, trace);
            upstreamRunOptions?.onReasoningUpdate?.(stage, trace);
          },
          onUiEvent: (ui) => {
            enqueueUiEvent(ui);
            upstreamRunOptions?.onUiEvent?.(ui);
          },
          onStageEvent: (stage, status, meta, durationMs) => {
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
          sendErrorEvent(
            result.error.code,
            result.error.message,
            result.error.retryable,
            result.error.retryAfterMs
          );
          return;
        }

        const flushBufferedTokens = () => {
          if (!bufferedTokens.length) return;
          bufferedTokens.forEach((token) => enqueueToken(token));
        };

        type ModerationClient = {
          moderations?: {
            create?: (params: { model?: string; input: string }) => Promise<{ results?: Array<{ flagged?: boolean }> }>;
          };
        };
        const moderationClient = client as ModerationClient;
        let blockedByModeration = false;
        if (moderationEnabled && typeof moderationClient.moderations?.create === 'function') {
          try {
            const textToModerate = (result.message || bufferedTokens.join('')).trim();
            if (textToModerate) {
              const moderation = await moderationClient.moderations.create({
                model: moderationModel ?? process.env.OPENAI_OUTPUT_MODERATION_MODEL ?? 'omni-moderation-latest',
                input: textToModerate,
              });
              blockedByModeration = (moderation?.results ?? []).some((entry: { flagged?: boolean }) => entry?.flagged);
            }
          } catch (error) {
            options?.onError?.(error);
          }
        }

        if (blockedByModeration) {
          errorEmitted = true;
          sendErrorEvent('internal_error', refusalMessage, false);
        } else {
          if (moderationEnabled) {
            flushBufferedTokens();
          }

          if (!streamed && result.message) {
            chunkText(result.message).forEach((token) => {
              enqueueToken(token);
            });
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
        const reasonMessage = typeof reason === 'object' && reason && 'message' in reason ? String((reason as Error).message) : null;
        const code = aborted
          ? reasonMessage === 'soft_timeout'
            ? 'llm_timeout'
            : 'stream_interrupted'
          : 'internal_error';
        const message =
          code === 'llm_timeout'
            ? 'I ran out of time while composing a response.'
            : 'Chat unavailable';
        const retryable = code !== 'internal_error' || Boolean(aborted);
        errorEmitted = true;
        sendErrorEvent(code, message, retryable);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        const totalDurationMs = Date.now() - streamStartedAt;
        if (!errorEmitted) {
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
