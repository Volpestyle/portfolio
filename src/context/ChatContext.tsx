'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  BannerState,
  ChatAttachment,
  ChatMessage,
  ChatRequestMessage,
} from '@/types/chat';

interface ChatContextValue {
  messages: ChatMessage[];
  isBusy: boolean;
  chatStarted: boolean;
  bannerState: BannerState;
  error?: string | null;
  send: (text: string) => Promise<void>;
  openProjectInline: (repoName: string) => Promise<void>;
  openDocInline: (repo: string, path: string, title?: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [bannerState, setBanner] = useState<BannerState>({ mode: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

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

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) {
        return;
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
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

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: flatten(nextMessages) }),
        });

        if (!response.ok || !response.body) {
          const message = await response.text();
          throw new Error(message || 'Unable to start chat.');
        }

        let assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ kind: 'text', text: '' }],
          createdAt: new Date().toISOString(),
          animated: true,
        };

        pushMessage(assistantMessage);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;

        const applyAssistantChange = (mutator: (message: ChatMessage) => void) => {
          mutator(assistantMessage);
          assistantMessage = {
            ...assistantMessage,
            parts: assistantMessage.parts.map((part) =>
              part.kind === 'text' ? { ...part } : part
            ),
          };
          replaceMessage(assistantMessage);
        };

        while (!finished) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            if (!frame.startsWith('data:')) {
              continue;
            }

            const payload = frame.slice(5).trim();
            if (!payload) {
              continue;
            }

            let event: { type: string; [key: string]: unknown };
            try {
              event = JSON.parse(payload);
            } catch (err) {
              console.warn('Failed to parse chat event', err);
              continue;
            }

            if (event.type === 'token' && typeof event.delta === 'string') {
              applyAssistantChange((message) => {
                const textPart = message.parts.find((part) => part.kind === 'text');
                if (textPart) {
                  textPart.text += event.delta as string;
                } else {
                  message.parts.unshift({ kind: 'text', text: event.delta as string });
                }
              });
              continue;
            }

            if (event.type === 'attachment' && event.attachment) {
              applyAssistantChange((message) => {
                message.parts.push({ kind: 'attachment', attachment: event.attachment as ChatAttachment });
              });
              continue;
            }

            if (event.type === 'error') {
              throw new Error((event.error as string) || 'Chat stream error');
            }

            if (event.type === 'done') {
              finished = true;
              break;
            }
          }
        }

      } catch (err) {
        console.error('Chat error', err);
        setError('Something went wrong. Mind trying again?');
      } finally {
        setBanner({ mode: 'hover' });
        setBusy(false);
      }
    },
    [chatStarted, commitMessages, isBusy, pushMessage, replaceMessage]
  );

  const openProjectInline = useCallback(
    (repoName: string) => send(`/open repo ${repoName}`),
    [send]
  );

  const openDocInline = useCallback(
    (repo: string, path: string, _title?: string) => send(`/open doc ${repo} ${path}`),
    [send]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      isBusy,
      chatStarted,
      bannerState,
      error,
      send,
      openProjectInline,
      openDocInline,
    }),
    [messages, isBusy, chatStarted, bannerState, error, send, openProjectInline, openDocInline]
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

function flatten(ms: ChatMessage[]): ChatRequestMessage[] {
  return ms.slice(-12).map((message) => ({
    role: message.role,
    content: message.parts
      .map((part) => (part.kind === 'text' ? part.text : '[attachment]'))
      .join('\n\n')
      .trim(),
  })).filter((entry) => entry.content.length > 0);
}
