'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/chat';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';

interface ChatThreadProps {
  messages: ChatMessage[];
  isBusy: boolean;
}

export function ChatThread({ messages, isBusy }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, isBusy]);

  return (
    <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto pr-2" aria-live="polite">
      <div className="flex flex-col gap-3">
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
