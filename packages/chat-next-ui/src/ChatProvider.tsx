'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BannerState,
  ChatMessage,
  ChatRequestMessage,
  PartialReasoningTrace,
  ProjectDetail,
  ProjectSummary,
  ResumeEntry,
} from '@portfolio/chat-contract';
import { DEFAULT_CHAT_HISTORY_LIMIT } from '@portfolio/chat-contract';
import { mergeReasoningTraces } from '@portfolio/chat-orchestrator';
import { normalizeProjectKey } from '@/lib/projects/normalize';
import { useChatUiState } from './chatUiState';
import type { ChatUiState } from './chatUiState';
import { useChatStream, type ChatAttachment } from './useChatStream';

export type { ChatSurfaceState } from './chatUiState';

type CacheableProject = ProjectSummary | ProjectDetail;
type ProjectCacheMap = Record<string, CacheableProject>;
type ExperienceCacheMap = Record<string, ResumeEntry>;

export type ChatProviderProps = {
  children: ReactNode;
  endpoint?: string;
  historyLimit?: number;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  requestFormatter?: (messages: ChatMessage[]) => ChatRequestMessage[];
  onError?: (error: Error) => void;
  /**
   * User-facing opt-in for reasoning traces.
   * Defaults to true to stream reasoning by default.
   */
  reasoningOptIn?: boolean;
  /**
   * Retry configuration for failed chat requests.
   */
  retryConfig?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
};

const STORAGE_KEY_CONVERSATION = 'chat:conversationId';
const buildCompletionStorageKey = (conversationId: string) => `chat:completionTimes:${conversationId}`;

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
} as const;

function calculateRetryDelay(attempt: number, config: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; backoffMultiplier: number }): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryInfo(error: unknown): { retryable: boolean; retryAfterMs?: number } {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return { retryable: true };
  }
  if (error && typeof error === 'object') {
    const retryable = (error as { retryable?: unknown }).retryable;
    const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
    return {
      retryable: retryable === true,
      retryAfterMs: typeof retryAfterMs === 'number' ? retryAfterMs : undefined,
    };
  }
  return { retryable: false };
}

interface ChatContextValue {
  messages: ChatMessage[];
  isBusy: boolean;
  chatStarted: boolean;
  bannerState: BannerState;
  error?: string | null;
  send: (text: string) => Promise<void>;
  uiState: ChatUiState;
  projectCache: ProjectCacheMap;
  experienceCache: ExperienceCacheMap;
  reasoningTraces: Record<string, PartialReasoningTrace>;
  reasoningEnabled: boolean;
  completionTimes: Record<string, number>;
  markMessageRendered: (messageId: string) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
  children,
  endpoint = '/api/chat',
  historyLimit = DEFAULT_CHAT_HISTORY_LIMIT,
  fetcher,
  requestFormatter,
  onError,
  reasoningOptIn = true,
  retryConfig = {},
}: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [bannerState, setBanner] = useState<BannerState>({ mode: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const { uiState, applyUiActions } = useChatUiState();
  const [projectCache, setProjectCache] = useState<ProjectCacheMap>({});
  const [experienceCache, setExperienceCache] = useState<ExperienceCacheMap>({});
  const [reasoningTraces, setReasoningTraces] = useState<Record<string, PartialReasoningTrace>>({});
  const [completionTimes, setCompletionTimes] = useState<Record<string, number>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationIdRef = useRef<string>(createMessageId());

  const historyWindow = Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : DEFAULT_CHAT_HISTORY_LIMIT;
  const formatMessages = useCallback(
    (ms: ChatMessage[]) => (requestFormatter ? requestFormatter(ms) : flatten(ms, historyWindow)),
    [historyWindow, requestFormatter]
  );

  // Hydrate conversation + completion times from sessionStorage to keep durations stable across soft reloads
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedConversationId = window.sessionStorage.getItem(STORAGE_KEY_CONVERSATION);
    const conversationId = storedConversationId?.trim() || conversationIdRef.current;
    if (!storedConversationId) {
      window.sessionStorage.setItem(STORAGE_KEY_CONVERSATION, conversationId);
    }
    conversationIdRef.current = conversationId;

    const completionKey = buildCompletionStorageKey(conversationId);
    const storedCompletions = window.sessionStorage.getItem(completionKey);
    if (storedCompletions) {
      try {
        const parsed = JSON.parse(storedCompletions) as Record<string, number>;
        if (parsed && typeof parsed === 'object') {
          setCompletionTimes(parsed);
        }
      } catch {
        // ignore invalid storage
      }
    }
  }, []);

  // Persist completion timestamps
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const conversationId = window.sessionStorage.getItem(STORAGE_KEY_CONVERSATION) || conversationIdRef.current;
    const completionKey = buildCompletionStorageKey(conversationId);
    try {
      window.sessionStorage.setItem(completionKey, JSON.stringify(completionTimes));
    } catch {
      // ignore storage write errors
    }
  }, [completionTimes]);

  const resolveFetcher = useCallback(() => {
    if (fetcher) {
      return fetcher;
    }
    if (typeof globalThis.fetch === 'function') {
      return (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
    }
    throw new Error('ChatProvider requires a fetch implementation.');
  }, [fetcher]);

  const commitMessages = useCallback((next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessages((prev) => {
      const resolved = typeof next === 'function' ? (next as (prev: ChatMessage[]) => ChatMessage[])(prev) : next;
      messagesRef.current = resolved;
      return resolved;
    });
  }, []);

  const pushMessage = useCallback(
    (message: ChatMessage) => {
      commitMessages((prev) => [...prev, message]);
    },
    [commitMessages]
  );

  const replaceMessage = useCallback(
    (updated: ChatMessage) => {
      commitMessages((prev) => prev.map((msg) => (msg.id === updated.id ? updated : msg)));
    },
    [commitMessages]
  );

  const cacheProjects = useCallback((payload?: CacheableProject | CacheableProject[]) => {
    if (!payload) {
      return;
    }
    const projects = Array.isArray(payload) ? payload : [payload];
    if (!projects.length) {
      return;
    }

    setProjectCache((prev) => {
      let mutated = false;
      const next = { ...prev };
      for (const project of projects) {
        const candidate = normalizeProjectPayload(project);
        const key = normalizeProjectKey(candidate?.slug ?? candidate?.name);
        if (!key || !candidate) {
          continue;
        }
        next[key] = candidate;
        mutated = true;
      }
      return mutated ? next : prev;
    });
  }, []);

  const cacheExperiences = useCallback((payload?: ResumeEntry | ResumeEntry[]) => {
    if (!payload) {
      return;
    }
    const experiences = Array.isArray(payload) ? payload : [payload];
    if (!experiences.length) {
      return;
    }

    setExperienceCache((prev) => {
      let mutated = false;
      const next = { ...prev };
      for (const experience of experiences) {
        const idKey = normalizeExperienceKey(
          experience.id ||
            ('slug' in experience ? experience.slug : null) ||
            ('title' in experience ? experience.title : null)
        );
        if (!idKey) {
          continue;
        }
        const slugKey = 'slug' in experience ? normalizeExperienceKey(experience.slug) : '';
        const titleKey = 'title' in experience ? normalizeExperienceKey(experience.title) : '';
        const normalized: ResumeEntry =
          'company' in experience && (!experience.type || experience.type === 'experience')
            ? { ...experience, type: 'experience' }
            : { ...experience };

        const assignIfMissing = (key: string) => {
          if (!key) {
            return;
          }
          const existing = next[key];
          if (!existing) {
            next[key] = normalized;
            mutated = true;
          }
        };

        assignIfMissing(idKey); // Always key by resume id for UI payload lookups
        assignIfMissing(slugKey);
        assignIfMissing(titleKey);
      }
      return mutated ? next : prev;
    });
  }, []);

  const ingestAttachment = useCallback(
    (attachment: ChatAttachment) => {
      if (!attachment?.id) {
        return;
      }
      if (attachment.type === 'project') {
        const project = coerceProjectAttachment(attachment);
        if (project) {
          cacheProjects(project);
        }
        return;
      }
      if (attachment.type === 'resume') {
        const entry = coerceResumeAttachment(attachment);
        if (entry) {
          cacheExperiences(entry);
        }
      }
    },
    [cacheExperiences, cacheProjects]
  );

  useEffect(() => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    let cancelled = false;

    (async () => {
      try {
        const resolvedFetcher = resolveFetcher();
        const response = await resolvedFetcher('/api/projects', { signal: controller?.signal });
        if (!response.ok) {
          throw new Error('Failed to fetch project list');
        }
        const payload = (await response.json()) as { projects?: CacheableProject[] };
        if (!cancelled && Array.isArray(payload?.projects)) {
          cacheProjects(payload.projects);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[ChatProvider] Failed to hydrate project cache', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [cacheProjects, resolveFetcher]);

  useEffect(() => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    let cancelled = false;

    (async () => {
      try {
        const resolvedFetcher = resolveFetcher();
        const response = await resolvedFetcher('/api/resume', { signal: controller?.signal });
        if (!response.ok) {
          throw new Error('Failed to fetch resume entries');
        }
        const payload = (await response.json()) as { entries?: ResumeEntry[] };
        if (!cancelled && Array.isArray(payload?.entries) && payload.entries.length) {
          cacheExperiences(payload.entries);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[ChatProvider] Failed to hydrate resume cache', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [cacheExperiences, resolveFetcher]);

  const applyReasoningTrace = useCallback(
    (itemId?: string, trace?: PartialReasoningTrace) => {
      if (!itemId) {
        return;
      }
      setReasoningTraces((prev) => {
        if (!trace) {
          if (!(itemId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[itemId];
          return next;
        }
        const existing = prev[itemId];
        const merged = mergeReasoningTraces(existing, trace);
        if (existing && merged === existing) {
          return prev;
        }
        return { ...prev, [itemId]: merged };
      });
    },
    [setReasoningTraces]
  );

  const markStreamCompletion = useCallback(
    (messageId: string, totalDurationMs?: number, createdAt?: string) => {
      if (!messageId || typeof totalDurationMs !== 'number' || !Number.isFinite(totalDurationMs)) {
        return;
      }
      setCompletionTimes((prev) => {
        if (prev[messageId]) {
          return prev;
        }
        const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;
        const completedAt = Number.isFinite(createdAtMs) ? createdAtMs + totalDurationMs : Date.now();
        return { ...prev, [messageId]: completedAt };
      });
    },
    [setCompletionTimes]
  );

  const markMessageRendered = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      // Mark completion timestamp if missing
      setCompletionTimes((prev) => {
        if (prev[messageId]) {
          return prev;
        }
        return { ...prev, [messageId]: Date.now() };
      });
      // Flip animated flag off for the rendered message
      commitMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, animated: false } : msg)));
    },
    [commitMessages]
  );

  const streamAssistantResponse = useChatStream({
    replaceMessage,
    applyUiActions,
    applyReasoningTrace,
    applyAttachment: ingestAttachment,
    recordCompletionTime: markStreamCompletion,
  });
  const shouldRequestReasoning = useMemo(() => Boolean(reasoningOptIn), [reasoningOptIn]);
  const reasoningEnabled = shouldRequestReasoning;
  const mergedRetryConfig = useMemo(() => ({ ...DEFAULT_RETRY_CONFIG, ...retryConfig }), [retryConfig]);

  const executeChatRequest = useCallback(async (
    requestMessages: ChatRequestMessage[],
    assistantMessage: ChatMessage,
    anchorId: string
  ): Promise<void> => {
    const resolvedFetcher = resolveFetcher();

    const response = await resolvedFetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: requestMessages,
        responseAnchorId: anchorId,
        reasoningEnabled: shouldRequestReasoning,
        conversationId: conversationIdRef.current,
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const isEventStream = contentType.includes('text/event-stream');
    if (!isEventStream) {
      const raw = await response.text();
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        if (parsed?.error?.message) {
          throw new Error(parsed.error.message);
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(raw || 'Unable to start chat.');
    }
    if (!response.body) {
      const message = await response.text();
      throw new Error(message || 'Unable to start chat.');
    }

    await streamAssistantResponse({ response, assistantMessage });
  }, [endpoint, resolveFetcher, shouldRequestReasoning, streamAssistantResponse]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        parts: [{ kind: 'text', text: trimmed }],
        createdAt: new Date().toISOString(),
      };

      const nextMessages = [...messagesRef.current, userMessage];
      commitMessages(nextMessages);

      if (!chatStarted) {
        setChatStarted(true);
      }

      setBanner({ mode: 'thinking' });
      setBusy(true);
      setError(null);

      const assistantMessageId = createMessageId();
      const assistantCreatedAt = new Date().toISOString();
      let assistantInserted = false;
      try {
        const requestMessages = formatMessages(nextMessages);

        // Insert the streaming assistant placeholder immediately so loading state is tied to the new turn,
        // not the previous assistant message.
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          parts: [{ kind: 'text', text: '', itemId: assistantMessageId }],
          createdAt: assistantCreatedAt,
          animated: true,
        };
        pushMessage(assistantMessage);
        assistantInserted = true;

        const resetAssistantForRetry = (anchorId: string) => {
          const refreshed: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            parts: [{ kind: 'text', text: '', itemId: anchorId }],
            createdAt: assistantCreatedAt,
            animated: true,
          };
          commitMessages((prev) => prev.map((msg) => (msg.id === assistantMessageId ? refreshed : msg)));
          applyReasoningTrace(assistantMessageId, undefined);
          return refreshed;
        };

        // Retry logic with exponential backoff
        let lastError: Error | null = null;
        let currentAssistant = assistantMessage;
        for (let attempt = 1; attempt <= mergedRetryConfig.maxAttempts; attempt++) {
          try {
            const anchorId = attempt === 1 ? assistantMessageId : createMessageId();
            if (attempt > 1) {
              currentAssistant = resetAssistantForRetry(anchorId);
            }

            if (attempt > 1) {
              // Update banner to show retry attempt
              setBanner({ mode: 'thinking', message: `Retrying... (${attempt}/${mergedRetryConfig.maxAttempts})` });
              const delay = calculateRetryDelay(attempt - 1, mergedRetryConfig);
              await sleep(delay);
            }

            await executeChatRequest(requestMessages, currentAssistant, anchorId);
            lastError = null; // Success, clear any previous error
            break; // Exit retry loop on success

          } catch (err) {
            lastError = err as Error;
            console.error(`Chat attempt ${attempt}/${mergedRetryConfig.maxAttempts} failed:`, err);

            const retryInfo = getRetryInfo(err);
            // Don't retry if error is not retryable or we've exhausted attempts
            if (!retryInfo.retryable || attempt === mergedRetryConfig.maxAttempts) {
              break;
            }

            const backoffDelay = calculateRetryDelay(attempt, mergedRetryConfig);
            const retryDelay = Math.max(backoffDelay, retryInfo.retryAfterMs ?? 0);
            if (retryDelay > 0) {
              await sleep(retryDelay);
            }
            // Continue to next attempt
          }
        }

        // If we still have an error after all retries, throw it
        if (lastError) {
          throw lastError;
        }
      } catch (err) {
        console.error('Chat error', err);
        onError?.(err as Error);
        const bannerMessage = (err as { banner?: string })?.banner;
        if (bannerMessage) {
          setBanner({ mode: 'warning', message: bannerMessage });
        }
        setError((err as Error)?.message || 'Something went wrong. Mind trying again?');
        const hasStreamedContent = messagesRef.current.some(
          (msg) =>
            msg.id === assistantMessageId &&
            (msg.parts ?? []).some((part) => part.kind === 'text' && part.text.trim().length > 0)
        );
        // Roll back the placeholder assistant message if the request failed before streaming.
        commitMessages((prev) => {
          if (!assistantInserted) {
            return prev;
          }
          if (hasStreamedContent) {
            return prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, animated: false } : msg));
          }
          return prev.filter((msg) => msg.id !== assistantMessageId);
        });
      } finally {
        setBanner((prev) => (prev.mode === 'thinking' ? { mode: 'hover' } : prev));
        setBusy(false);
      }
    },
    [
      chatStarted,
      commitMessages,
      endpoint,
      formatMessages,
      isBusy,
      onError,
      pushMessage,
      executeChatRequest,
      mergedRetryConfig,
      applyReasoningTrace,
    ]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      isBusy,
      chatStarted,
      bannerState,
      error,
      send,
      uiState,
      projectCache,
      experienceCache,
      reasoningTraces,
      reasoningEnabled,
      completionTimes,
      markMessageRendered,
    }),
    [
      messages,
      isBusy,
      chatStarted,
      bannerState,
      error,
      send,
      uiState,
      projectCache,
      experienceCache,
      reasoningTraces,
      reasoningEnabled,
      completionTimes,
      markMessageRendered,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

function flatten(ms: ChatMessage[], limit: number): ChatRequestMessage[] {
  return ms
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      content: message.parts
        .map((part) => {
          if (part.kind === 'text') {
            return part.text;
          }
          return '[unsupported part]';
        })
        .join('\n\n')
        .trim(),
    }))
    .filter((entry) => entry.content.length > 0);
}

function normalizeProjectPayload(project?: CacheableProject): CacheableProject | null {
  if (!project) {
    return null;
  }
  const slug = typeof project.slug === 'string' && project.slug.trim().length ? project.slug.trim() : undefined;
  const name = typeof project.name === 'string' && project.name.trim().length ? project.name.trim() : undefined;
  const id = typeof project.id === 'string' && project.id.trim().length ? project.id.trim() : undefined;
  const fallback = slug ?? id ?? name;
  if (!fallback) {
    return null;
  }
  return {
    ...project,
    id: id ?? fallback,
    slug: slug ?? fallback,
    name: name ?? fallback,
  };
}

function coerceProjectAttachment(attachment: ChatAttachment): CacheableProject | null {
  if (!attachment?.data || typeof attachment.data !== 'object') {
    return null;
  }
  const record = { ...(attachment.data as Record<string, unknown>) } as CacheableProject & Record<string, unknown>;
  if (!('id' in record) || typeof record.id !== 'string' || !record.id?.trim()) {
    (record as Record<string, unknown>).id = attachment.id;
  }
  if (!('slug' in record) || typeof record.slug !== 'string' || !record.slug?.trim()) {
    (record as Record<string, unknown>).slug = attachment.id;
  }
  if (!('name' in record) || typeof record.name !== 'string' || !record.name?.trim()) {
    (record as Record<string, unknown>).name = (record as { slug?: string }).slug ?? attachment.id;
  }
  return normalizeProjectPayload(record as CacheableProject);
}

function coerceResumeAttachment(attachment: ChatAttachment): ResumeEntry | null {
  if (!attachment?.data || typeof attachment.data !== 'object') {
    return null;
  }
  const record = { ...(attachment.data as Record<string, unknown>) } as ResumeEntry & Record<string, unknown>;
  if (!('id' in record) || typeof record.id !== 'string' || !record.id?.trim()) {
    (record as Record<string, unknown>).id = attachment.id;
  }
  if ('slug' in record && typeof record.slug === 'string') {
    (record as Record<string, unknown>).slug = record.slug.trim();
  }
  if ('company' in record && (!record.type || record.type === 'experience')) {
    (record as Record<string, unknown>).type = 'experience';
  }
  return record as ResumeEntry;
}

function normalizeExperienceKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
