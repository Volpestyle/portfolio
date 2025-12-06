import { useCallback } from 'react';
import type {
  ChatMessage,
  ChatTextPart,
  PartialReasoningTrace,
  ReasoningStage,
  ReasoningTraceError,
} from '@portfolio/chat-contract';
import { parseChatStream, type ChatStreamEvent } from './chatStreamParser';
import type { ApplyUiActionOptions } from './chatUiState';
import { isTypewriterDebugEnabled, typewriterDebug, typewriterPreview } from './typewriterDebug';

export type ChatAttachment = {
  type: 'project' | 'resume';
  id: string;
  data?: unknown;
};

type StreamDependencies = {
  replaceMessage: (message: ChatMessage) => void;
  applyUiActions: (options?: ApplyUiActionOptions) => void;
  applyReasoningTrace: (itemId?: string, trace?: PartialReasoningTrace) => void;
  applyAttachment?: (attachment: ChatAttachment) => void;
  recordCompletionTime?: (messageId: string, totalDurationMs?: number, createdAt?: string) => void;
};

type StreamRequest = {
  response: Response;
  assistantMessage: ChatMessage;
};

export function useChatStream({
  replaceMessage,
  applyUiActions,
  applyReasoningTrace,
  applyAttachment,
  recordCompletionTime,
}: StreamDependencies) {
  return useCallback(
    async ({ response, assistantMessage }: StreamRequest) => {
      if (!response.body) {
        throw new Error('The chat response body is missing.');
      }

      let mutableAssistant = assistantMessage;
      const itemOrder: string[] = [];

      const applyAssistantChange = (mutator: (message: ChatMessage) => void) => {
        mutator(mutableAssistant);
        mutableAssistant = {
          ...mutableAssistant,
          parts: mutableAssistant.parts.map((part) => (part.kind === 'text' ? { ...part } : part)),
        };
        replaceMessage(mutableAssistant);
      };

      const registerItem = (itemId?: string) => {
        if (!itemId || itemOrder.includes(itemId)) {
          return;
        }
        itemOrder.push(itemId);
      };

      const findInsertIndex = (message: ChatMessage, itemId?: string) => {
        if (!itemId) {
          return message.parts.length;
        }

        let targetIndex = itemOrder.indexOf(itemId);
        if (targetIndex === -1) {
          itemOrder.push(itemId);
          targetIndex = itemOrder.length - 1;
        }

        for (let idx = 0; idx < message.parts.length; idx += 1) {
          const partItemId = message.parts[idx].itemId;
          if (!partItemId) {
            continue;
          }
          const partOrderIndex = itemOrder.indexOf(partItemId);
          if (partOrderIndex !== -1 && partOrderIndex > targetIndex) {
            return idx;
          }
        }

        return message.parts.length;
      };

      const ensureTextPart = (message: ChatMessage, itemId?: string): ChatTextPart => {
        if (itemId) {
          const existingPart = message.parts.find((part) => part.kind === 'text' && part.itemId === itemId) as
            | ChatTextPart
            | undefined;
          if (existingPart) {
            return existingPart;
          }
        }

        // Reuse a single existing text part if it matches or is unlabeled to avoid duplicate renderings.
        const fallback = message.parts.find((part) => part.kind === 'text') as ChatTextPart | undefined;
        if (fallback && (!itemId || !fallback.itemId || fallback.itemId === itemId)) {
          if (itemId && !fallback.itemId) {
            fallback.itemId = itemId;
          }
          return fallback;
        }

        if (itemId) {
          const insertIndex = findInsertIndex(message, itemId);
          const nextPart: ChatTextPart = { kind: 'text', text: '', itemId };
          message.parts.splice(insertIndex, 0, nextPart);
          return nextPart;
        }

        const nextPart: ChatTextPart = { kind: 'text', text: '' };
        message.parts.push(nextPart);
        return nextPart;
      };

      const handleEvent = (event: ChatStreamEvent) => {
        if (event.type === 'item' && typeof event.itemId === 'string') {
          registerItem(event.itemId);
          return;
        }

        if (event.type === 'ui') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : undefined;
          registerItem(itemId);
          const uiPayload = coerceUiPayload((event as { ui?: unknown }).ui);
          applyUiActions({
            anchorItemId: itemId ?? mutableAssistant.id,
            ui: uiPayload,
          });
          return;
        }

        if (event.type === 'token' && typeof (event as { token?: unknown }).token === 'string') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : undefined;
          const token = (event as { token: string }).token;
          registerItem(itemId);
          const debugEnabled = isTypewriterDebugEnabled();
          applyAssistantChange((message) => {
            const textPart = ensureTextPart(message, itemId);
            const prevLength = textPart.text.length;
            textPart.text += token;
            if (debugEnabled) {
              const textParts = message.parts.filter((part) => part.kind === 'text') as ChatTextPart[];
              const totalLength = textParts.reduce((sum, part) => sum + part.text.length, 0);
              typewriterDebug('sse_token', {
                messageId: mutableAssistant.id,
                itemId: itemId ?? textPart.itemId,
                tokenLength: token.length,
                tokenPreview: typewriterPreview(token, 200),
                prevLength,
                nextLength: textPart.text.length,
                totalTextLength: totalLength,
                partCount: message.parts.length,
              });
            }
          });
          return;
        }

        if (event.type === 'reasoning') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : mutableAssistant.id;
          registerItem(itemId);
          const stage = isReasoningStage((event as { stage?: unknown }).stage) ? ((event as { stage?: unknown }).stage as ReasoningStage) : undefined;
          const delta = typeof (event as { delta?: unknown }).delta === 'string' ? (event as { delta?: string }).delta : undefined;
          const notes = typeof (event as { notes?: unknown }).notes === 'string' ? (event as { notes?: string }).notes : undefined;
          const progress =
            typeof (event as { progress?: unknown }).progress === 'number'
              ? (event as { progress?: number }).progress
              : undefined;

          let trace = coerceReasoningTrace((event as { trace?: unknown }).trace);
          if (stage && (delta || notes || typeof progress === 'number')) {
            trace = {
              ...(trace ?? { plan: null, retrieval: null, answer: null, error: null }),
              streaming: {
                ...((trace ?? {}).streaming ?? {}),
                [stage]: {
                  ...(trace?.streaming?.[stage] ?? {}),
                  text: delta,
                  notes,
                  progress,
                },
              },
            };
          }

          if (trace) {
            applyReasoningTrace(itemId, trace);
          }
          return;
        }

        if (event.type === 'ui_actions') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : mutableAssistant.id;
          registerItem(itemId);
          return;
        }

        if (event.type === 'attachment') {
          const attachment = coerceAttachment((event as { attachment?: unknown }).attachment);
          if (attachment && applyAttachment) {
            applyAttachment(attachment);
          }
          return;
        }

        if (event.type === 'error') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : mutableAssistant.id;
          registerItem(itemId);
          const reasoningError = coerceReasoningError(event);
          if (reasoningError) {
            applyReasoningTrace(itemId, {
              plan: null,
              retrieval: null,
              answer: null,
              error: reasoningError,
            });
          }
          const errorMessage =
            (event as { message?: string }).message ?? (event as { error?: string }).error ?? 'Chat stream error';
          applyAssistantChange((message) => {
            message.animated = false;
          });
          throw new Error(errorMessage);
        }

        if (event.type === 'done') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : mutableAssistant.id;
          const totalDurationMs = typeof event.totalDurationMs === 'number' ? event.totalDurationMs : undefined;
          if (recordCompletionTime) {
            recordCompletionTime(itemId, totalDurationMs, mutableAssistant.createdAt);
          }
          if (isTypewriterDebugEnabled()) {
            const textParts = mutableAssistant.parts.filter((part) => part.kind === 'text') as ChatTextPart[];
            typewriterDebug('sse_done', {
              messageId: mutableAssistant.id,
              itemId,
              totalDurationMs,
              textParts: textParts.map((part) => ({
                itemId: part.itemId,
                length: part.text.length,
                preview: typewriterPreview(part.text, 160),
              })),
            });
          }
          registerItem(itemId);
        }
      };

      for await (const event of parseChatStream(response.body, {
        onParseError: (err) => console.warn('Failed to parse chat event', err),
      })) {
        handleEvent(event);
        if (event.type === 'done') {
          break;
        }
      }
    },
    [applyAttachment, applyReasoningTrace, applyUiActions, recordCompletionTime, replaceMessage]
  );
}

function coerceUiPayload(input: unknown): { showProjects?: string[]; showExperiences?: string[]; showEducation?: string[]; showLinks?: string[] } | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const normalizeIds = (value: unknown) => {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  };

  const showProjects = normalizeIds(record.showProjects);
  const showExperiences = normalizeIds(record.showExperiences);
  const showEducation = normalizeIds(record.showEducation);
  const showLinks = normalizeIds(record.showLinks);

  if (showProjects === undefined && showExperiences === undefined && showEducation === undefined && showLinks === undefined) {
    return undefined;
  }

  return {
    showProjects,
    showExperiences,
    showEducation,
    showLinks,
  };
}

function coerceReasoningTrace(input: unknown): PartialReasoningTrace | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Partial<PartialReasoningTrace>;
  const hasKnownField =
    'plan' in record ||
    'retrieval' in record ||
    'retrievalDocs' in record ||
    'answer' in record ||
    'error' in record ||
    'streaming' in record ||
    'debug' in record;
  if (!hasKnownField) {
    return undefined;
  }
  const streaming =
    'streaming' in record && record.streaming && typeof record.streaming === 'object'
      ? (record.streaming as PartialReasoningTrace['streaming'])
      : undefined;
  const debug =
    'debug' in record && record.debug && typeof record.debug === 'object'
      ? (record.debug as PartialReasoningTrace['debug'])
      : undefined;
  const retrievalDocs =
    'retrievalDocs' in record && record.retrievalDocs && typeof record.retrievalDocs === 'object'
      ? (record.retrievalDocs as PartialReasoningTrace['retrievalDocs'])
      : undefined;
  return {
    plan: 'plan' in record ? (record.plan ?? null) : null,
    retrieval: 'retrieval' in record ? (record.retrieval ?? null) : null,
    retrievalDocs,
    answer: 'answer' in record ? (record.answer ?? null) : null,
    error: 'error' in record ? (record.error ?? null) : null,
    debug,
    streaming,
  };
}

function coerceReasoningError(input: unknown): ReasoningTraceError | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const message =
    typeof record.message === 'string' ? record.message : typeof record.error === 'string' ? record.error : undefined;
  if (!message) {
    return undefined;
  }
  const code = typeof record.code === 'string' ? record.code : undefined;
  const retryable = typeof record.retryable === 'boolean' ? record.retryable : undefined;
  const retryAfterMs = typeof record.retryAfterMs === 'number' ? record.retryAfterMs : undefined;
  const stage = typeof record.stage === 'string' ? (record.stage as ReasoningTraceError['stage']) : undefined;
  return { message, code, retryable, retryAfterMs, stage };
}

function coerceAttachment(input: unknown): ChatAttachment | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const type = record.type;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id || (type !== 'project' && type !== 'resume')) {
    return undefined;
  }
  return { type, id, data: record.data } as ChatAttachment;
}

function isReasoningStage(value: unknown): value is ReasoningStage {
  return value === 'planner' || value === 'retrieval' || value === 'answer';
}
