'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BannerState,
  ChatAttachment,
  ChatAttachmentPart,
  ChatMessage,
  ChatRequestMessage,
  ChatTextPart,
} from '@/types/chat';

interface ChatContextValue {
  messages: ChatMessage[];
  isBusy: boolean;
  chatStarted: boolean;
  bannerState: BannerState;
  error?: string | null;
  send: (text: string) => Promise<void>;
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
          parts: [],
          createdAt: new Date().toISOString(),
          animated: true,
        };

        pushMessage(assistantMessage);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;
        const itemOrder: string[] = [];

        const applyAssistantChange = (mutator: (message: ChatMessage) => void) => {
          mutator(assistantMessage);
          assistantMessage = {
            ...assistantMessage,
            parts: assistantMessage.parts.map((part) => (part.kind === 'text' ? { ...part } : part)),
          };
          replaceMessage(assistantMessage);
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

            const insertIndex = findInsertIndex(message, itemId);
            const nextPart: ChatTextPart = { kind: 'text', text: '', itemId };
            message.parts.splice(insertIndex, 0, nextPart);
            return nextPart;
          }

          const fallback =
            (message.parts.find((part) => part.kind === 'text') as ChatTextPart | undefined) ?? undefined;

          if (fallback) {
            return fallback;
          }

          const nextPart: ChatTextPart = { kind: 'text', text: '' };
          message.parts.push(nextPart);
          return nextPart;
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

            if (event.type === 'item' && typeof event.itemId === 'string') {
              registerItem(event.itemId as string);
              continue;
            }

            if (event.type === 'token' && typeof event.delta === 'string') {
              const itemId = typeof event.itemId === 'string' ? (event.itemId as string) : undefined;
              registerItem(itemId);
              applyAssistantChange((message) => {
                const textPart = ensureTextPart(message, itemId);
                textPart.text += event.delta as string;
              });
              continue;
            }

            if (event.type === 'attachment' && event.attachment) {
              const itemId = typeof event.itemId === 'string' ? (event.itemId as string) : undefined;
              registerItem(itemId);
              applyAssistantChange((message) => {
                const attachmentPart: ChatAttachmentPart = {
                  kind: 'attachment',
                  attachment: event.attachment as ChatAttachment,
                  itemId,
                };

                if (itemId) {
                  const existingIndex = message.parts.findIndex((part) => part.itemId === itemId);
                  if (existingIndex !== -1) {
                    message.parts[existingIndex] = attachmentPart;
                    return;
                  }
                }

                const insertIndex = findInsertIndex(message, itemId);
                message.parts.splice(insertIndex, 0, attachmentPart);
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

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      isBusy,
      chatStarted,
      bannerState,
      error,
      send,
    }),
    [messages, isBusy, chatStarted, bannerState, error, send]
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
  return ms
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.parts
        .map((part) => (part.kind === 'text' ? part.text : '[attachment]'))
        .join('\n\n')
        .trim(),
    }))
    .filter((entry) => entry.content.length > 0);
}
