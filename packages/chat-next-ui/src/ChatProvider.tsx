'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BannerState,
  ChatMessage,
  ChatRequestMessage,
  PartialReasoningTrace,
  ReasoningTraceError,
  ProjectDetail,
  ProjectSummary,
  ResumeEntry,
} from '@portfolio/chat-contract';
import { DEFAULT_CHAT_HISTORY_LIMIT } from '@portfolio/chat-contract';
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
  ownerId?: string;
  /**
   * User-facing opt-in for reasoning traces.
   * Defaults to true to stream reasoning by default.
   */
  reasoningOptIn?: boolean;
};

const buildConversationStorageKey = (ownerId: string) => `chat:${ownerId}:conversationId`;
const buildCompletionStorageKey = (ownerId: string, conversationId: string) =>
  `chat:${ownerId}:completionTimes:${conversationId}`;

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
  ownerId,
  reasoningOptIn = true,
}: ChatProviderProps) {
  const [resolvedOwnerId, setResolvedOwnerId] = useState<string>(
    () => ownerId ?? process.env.NEXT_PUBLIC_CHAT_OWNER_ID ?? 'portfolio-owner'
  );
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
    const conversationKey = buildConversationStorageKey(resolvedOwnerId);
    const storedConversationId = window.sessionStorage.getItem(conversationKey);
    const conversationId = storedConversationId?.trim() || conversationIdRef.current;
    if (!storedConversationId) {
      window.sessionStorage.setItem(conversationKey, conversationId);
    }
    conversationIdRef.current = conversationId;

    const completionKey = buildCompletionStorageKey(resolvedOwnerId, conversationId);
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
  }, [resolvedOwnerId]);

  // Persist completion timestamps
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const conversationKey = buildConversationStorageKey(resolvedOwnerId);
    const conversationId = window.sessionStorage.getItem(conversationKey) || conversationIdRef.current;
    const completionKey = buildCompletionStorageKey(resolvedOwnerId, conversationId);
    try {
      window.sessionStorage.setItem(completionKey, JSON.stringify(completionTimes));
    } catch {
      // ignore storage write errors
    }
  }, [completionTimes, resolvedOwnerId]);

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
  useEffect(() => {
    const resolved = ownerId ?? process.env.NEXT_PUBLIC_CHAT_OWNER_ID ?? 'portfolio-owner';
    setResolvedOwnerId(resolved);
  }, [ownerId]);
  const shouldRequestReasoning = useMemo(() => Boolean(reasoningOptIn), [reasoningOptIn]);
  const reasoningEnabled = shouldRequestReasoning;

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
      let assistantInserted = false;
      try {
        const resolvedFetcher = resolveFetcher();
        const requestMessages = formatMessages(nextMessages);

        // Insert the streaming assistant placeholder immediately so loading state is tied to the new turn,
        // not the previous assistant message.
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          parts: [{ kind: 'text', text: '', itemId: assistantMessageId }],
          createdAt: new Date().toISOString(),
          animated: true,
        };
        pushMessage(assistantMessage);
        assistantInserted = true;

        const response = await resolvedFetcher(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: requestMessages,
            responseAnchorId: assistantMessageId,
            ownerId: resolvedOwnerId,
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
      } catch (err) {
        console.error('Chat error', err);
        onError?.(err as Error);
        setError((err as Error)?.message || 'Something went wrong. Mind trying again?');
        // Roll back the placeholder assistant message if the request failed before streaming.
        commitMessages((prev) => (assistantInserted ? prev.filter((msg) => msg.id !== assistantMessageId) : prev));
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
      resolveFetcher,
      streamAssistantResponse,
      resolvedOwnerId,
      shouldRequestReasoning,
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

function normalizeProjectKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
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

function mergeReasoningTraces(
  existing: PartialReasoningTrace | undefined,
  incoming: PartialReasoningTrace
): PartialReasoningTrace {
  const merged: PartialReasoningTrace = {
    plan: incoming.plan ?? existing?.plan ?? null,
    retrieval: incoming.retrieval ?? existing?.retrieval ?? null,
    answer: incoming.answer ?? existing?.answer ?? null,
    error: mergeReasoningErrors(existing?.error, incoming.error, {
      plan: incoming.plan ?? existing?.plan ?? null,
      retrieval: incoming.retrieval ?? existing?.retrieval ?? null,
      answer: incoming.answer ?? existing?.answer ?? null,
    }),
  };
  if (existing && reasoningTracesEqual(existing, merged)) {
    return existing;
  }
  return merged;
}

function reasoningTracesEqual(a: PartialReasoningTrace, b: PartialReasoningTrace): boolean {
  return (
    a.plan === b.plan &&
    a.retrieval === b.retrieval &&
    a.answer === b.answer &&
    a.error === b.error
  );
}

function mergeReasoningErrors(
  existing: PartialReasoningTrace['error'],
  incoming: PartialReasoningTrace['error'],
  mergedStages: Pick<PartialReasoningTrace, 'plan' | 'retrieval' | 'answer'>
): ReasoningTraceError | null {
  const candidate = incoming ?? existing ?? null;
  if (!candidate) {
    return null;
  }

  const stage = candidate.stage && candidate.stage.length ? candidate.stage : inferErroredStage(mergedStages);
  if (!incoming && existing && existing.stage === stage) {
    return existing;
  }

  return {
    ...candidate,
    stage,
  };
}

function inferErroredStage(
  trace: Pick<PartialReasoningTrace, 'plan' | 'retrieval' | 'answer'>
): ReasoningTraceError['stage'] {
  if (trace.answer) return 'answer';
  if (trace.retrieval) return 'retrieval';
  if (trace.plan) return 'planner';
  return 'planner';
}
