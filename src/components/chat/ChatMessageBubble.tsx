'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { TypewriterMessage } from './TypewriterMessage';
import { Markdown } from '@/components/Markdown';
import { InlineUiPortalAnchor } from '@/components/chat/InlineUiPortal';
import { useChat } from '@/context/ChatContext';

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
  const { markMessageRendered } = useChat();
  const [shouldAnimate, setShouldAnimate] = useState<boolean>(() => isStreamingMessage && message.animated !== false);

  useEffect(() => {
    // Only START animation when streaming begins - let onDone handle stopping it
    if (isStreamingMessage && message.animated !== false) {
      setShouldAnimate(true);
    }
    // Only force-stop if explicitly marked as non-animated
    if (message.animated === false) {
      setShouldAnimate(false);
    }
  }, [isStreamingMessage, message.animated]);

  const handleTypewriterDone = useCallback(() => {
    setShouldAnimate(false);
    markMessageRendered(message.id);
  }, [markMessageRendered, message.id]);

  const wrapperClass = isUser
    ? 'inline-block max-w-[85%] sm:max-w-[70%] rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white text-left shadow-xl'
    : 'w-full max-w-full sm:max-w-[85%] space-y-3 text-sm text-white';

  // Find the index of the last text part
  const lastTextPartIndex = message.parts
    .map((part, idx) => (part.kind === 'text' ? idx : -1))
    .filter((idx) => idx !== -1)
    .pop();

  // Check if message has any content (allow empty during streaming so the placeholder still renders)
  const hasContent =
    isStreamingMessage || message.parts.some((part) => part.kind === 'text' && part.text.trim().length > 0);

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
            if (!part.text.trim() && !isStreamingMessage) {
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

            const renderTypewriter = !isUser && shouldAnimate;
            const showCursor = shouldAnimate ? isLastTextPart : isLastAssistantMessage && isLastTextPart;

            if (renderTypewriter) {
              return (
                <TypewriterMessage
                  key={`${message.id}-text-${index}`}
                  text={part.text}
                  messageId={message.id}
                  itemId={part.itemId ?? message.id}
                  className="text-sm leading-relaxed"
                  showCursor={showCursor}
                  streaming={isStreamingMessage}
                  markdown
                  onDone={handleTypewriterDone}
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
