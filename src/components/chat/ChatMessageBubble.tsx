'use client';

import type { ChatMessage } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { TypewriterMessage } from './TypewriterMessage';
import { Markdown } from '@/components/Markdown';
import { InlineUiPortalAnchor } from '@/components/chat/InlineUiPortal';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreamingMessage?: boolean;
  isLastAssistantMessage?: boolean;
}

export function ChatMessageBubble({
  message,
  isStreamingMessage = false,
  isLastAssistantMessage = false,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  const wrapperClass = isUser
    ? 'w-full max-w-[85%] rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-xl'
    : 'w-full max-w-[85%] space-y-3 text-sm text-white';

  // Find the index of the last text part
  const lastTextPartIndex = message.parts
    .map((part, idx) => (part.kind === 'text' ? idx : -1))
    .filter((idx) => idx !== -1)
    .pop();

  // Check if message has any content
  const hasContent = message.parts.some((part) => part.kind === 'text' && part.text.trim().length > 0);

  // Don't render completely empty messages
  if (!hasContent) {
    return null;
  }

  const testId = isUser ? 'chat-user-message' : 'chat-assistant-message';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={wrapperClass} data-testid={testId}>
        {message.parts.map((part, index) => {
          if (part.kind === 'text') {
            // Skip empty text parts
            if (!part.text.trim()) {
              return null;
            }

            if (isUser) {
              return (
                <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed">
                  {part.text}
                </p>
              );
            }

            const isLastTextPart = index === lastTextPartIndex;

            const canAnimate = isStreamingMessage && message.animated !== false;

            if (canAnimate) {
              return (
                <TypewriterMessage
                  key={`${message.id}-text-${index}`}
                  text={part.text}
                  className="text-sm leading-relaxed"
                  showCursor={isLastTextPart}
                  streaming
                  markdown
                />
              );
            }

            // All other assistant messages just display normally (with Markdown)
            return (
              <Markdown
                key={`${message.id}-text-${index}`}
                content={part.text}
                variant="compact"
                showCursor={isLastAssistantMessage && isLastTextPart}
              />
            );
          }

          return null;
        })}
        {!isUser ? <InlineUiPortalAnchor anchorId={message.id} /> : null}
      </div>
    </div>
  );
}
