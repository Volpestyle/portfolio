'use client';

import type { ChatMessage } from '@/types/chat';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { Spinner } from '@/components/ui/spinner';

interface ChatThreadProps {
  messages: ChatMessage[];
  isBusy: boolean;
}

function ThinkingSpinner() {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="relative h-4 w-4">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
        </div>
        <span className="text-xs text-white/40">Thinking...</span>
      </div>
    </div>
  );
}

export function ChatThread({ messages, isBusy }: ChatThreadProps) {
  // Find the last assistant message
  const lastAssistantMessageId = messages
    .slice()
    .reverse()
    .find((msg) => msg.role === 'assistant')?.id;

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {messages.map((message) => (
        <ChatMessageBubble
          key={message.id}
          message={message}
          isLastAssistantMessage={message.id === lastAssistantMessageId}
        />
      ))}
      {isBusy && <ThinkingSpinner />}
    </div>
  );
}
