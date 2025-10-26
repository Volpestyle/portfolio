'use client';

import { ChatThread } from '@/components/chat/ChatThread';
import { ChatComposer } from './ChatComposer';
import { useChat } from '@/hooks/useChat';
import { ChatQueryProvider } from './ChatQueryProvider';
import type { DehydratedState } from '@tanstack/react-query';

type ChatDockProps = {
  initialQueryState?: DehydratedState;
};

export default function ChatDock({ initialQueryState }: ChatDockProps) {
  const { messages, isBusy, send, error } = useChat();
  const hasMessages = messages.length > 0;

  return (
    <ChatQueryProvider initialState={initialQueryState}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl">
        <ChatThread messages={messages} isBusy={isBusy} />
        <ChatComposer hasMessages={hasMessages} onSend={send} isBusy={isBusy} />
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </div>
    </ChatQueryProvider>
  );
}
