'use client';

import { createPortal } from 'react-dom';
import type { ChatMessage } from '@portfolio/chat-contract';
import type { ChatSurfaceState } from '@portfolio/chat-next-ui';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { ChatActionSurface } from '@/components/chat/ChatActionSurface';
import { InlineUiPortalAnchor, InlineUiPortalProvider, useInlineUiPortal } from '@/components/chat/InlineUiPortal';
import { useChat } from '@/hooks/useChat';
import { ChatReasoningDisplay } from '@/components/chat/ChatReasoningDisplay';

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
  const { uiState, reasoningTraces, reasoningEnabled, completionTimes } = useChat();
  const surfaces = uiState.surfaces ?? [];
  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find((msg) => msg.role === 'assistant');
  const lastAssistantMessageId = lastAssistantMessage?.id;
  const lastAssistantCompleted = lastAssistantMessageId ? Boolean(completionTimes[lastAssistantMessageId]) : false;
  const lastAssistantAnimated = lastAssistantMessage?.animated !== false;
  const streamingAssistantMessageId =
    lastAssistantMessageId && (isBusy || lastAssistantAnimated || !lastAssistantCompleted)
      ? lastAssistantMessageId
      : undefined;

  // Show thinking spinner when busy and assistant hasn't started producing content
  const lastMessage = messages[messages.length - 1];
  const lastMessageAssistant = lastMessage?.role === 'assistant' ? lastMessage : undefined;
  const assistantHasContent = lastMessageAssistant?.parts?.some(
    (p) => p.kind === 'text' && p.text.trim().length > 0
  );
  const currentTrace = streamingAssistantMessageId
    ? reasoningTraces[streamingAssistantMessageId]
    : null;
  // Meta/chitchat turns hide the reasoning panel, so we need spinner to persist
  const isMetaTurn = currentTrace?.plan?.questionType === 'meta' || currentTrace?.answerMeta?.questionType === 'meta';
  const hasRenderableTrace =
    currentTrace &&
    (currentTrace.plan || currentTrace.retrieval || currentTrace.evidence || currentTrace.answerMeta || currentTrace.error);
  const reasoningWillDisplay = reasoningEnabled && !isMetaTurn && hasRenderableTrace;
  const showPendingThinking = isBusy && !assistantHasContent && !reasoningWillDisplay;

  const fallbackAnchorId = '__chat-surface-fallback__';
  const actionableSurfaces = surfaces.filter(hasSurfacePayload);

  // Calculate duration for a completed message
  const calculateDuration = (message: ChatMessage): number | undefined => {
    const completedAt = completionTimes[message.id];
    if (!message.createdAt || !completedAt) {
      return undefined;
    }
    const createdAt = new Date(message.createdAt).getTime();
    return completedAt - createdAt;
  };

  return (
    <InlineUiPortalProvider>
      <div className="flex flex-col gap-3" aria-live="polite" data-testid="chat-thread">
        {messages.map((message, idx) => {
          const isInProgress = streamingAssistantMessageId === message.id;

          // Check if next message is an assistant message with reasoning (completed)
          const nextMessage = messages[idx + 1];
          const nextMessageHasReasoning =
            nextMessage?.role === 'assistant' &&
            reasoningTraces[nextMessage.id] &&
            streamingAssistantMessageId !== nextMessage.id;

          // Check if next message is the streaming assistant message
          const nextIsStreaming = nextMessage?.role === 'assistant' && nextMessage.id === streamingAssistantMessageId;

          return (
            <div key={message.id} className="flex flex-col gap-2">
              <ChatMessageBubble
                message={message}
                isStreamingMessage={isInProgress}
                isLastAssistantMessage={message.id === lastAssistantMessageId}
              />
              {/* Show reasoning/thinking after user message */}
              {message.role === 'user' && (
                <>
                  {/* Completed reasoning for next message */}
                  {nextMessageHasReasoning && (
                    <ChatReasoningDisplay
                      trace={reasoningTraces[nextMessage.id]}
                      show={reasoningEnabled}
                      isStreaming={false}
                      durationMs={calculateDuration(nextMessage)}
                    />
                  )}
                  {/* Streaming reasoning (if next message is the streaming one) */}
                  {nextIsStreaming && reasoningEnabled && (
                    <ChatReasoningDisplay
                      trace={reasoningTraces[streamingAssistantMessageId] ?? null}
                      show={reasoningEnabled}
                      isStreaming={true}
                    />
                  )}
                  {/* Fallback thinking spinner when reasoning is disabled */}
                  {nextIsStreaming && !reasoningEnabled && <ThinkingSpinner />}
                </>
              )}
            </div>
          );
        })}
        {/* Show thinking spinner immediately when waiting for assistant response to begin */}
        {showPendingThinking && <ThinkingSpinner />}
        <InlineUiPortalAnchor anchorId={fallbackAnchorId} />
      </div>
      {actionableSurfaces.map((surface) => (
        <ChatActionSurfacePortal key={surface.anchorId} surface={surface} fallbackAnchorId={fallbackAnchorId} />
      ))}
    </InlineUiPortalProvider>
  );
}

function ChatActionSurfacePortal({
  surface,
  fallbackAnchorId,
}: {
  surface: ChatSurfaceState;
  fallbackAnchorId: string;
}) {
  const { getAnchor } = useInlineUiPortal();
  const target = getAnchor(surface.anchorId) || getAnchor(fallbackAnchorId);
  if (!target) {
    return null;
  }
  return createPortal(<ChatActionSurface surface={surface} />, target);
}

function hasSurfacePayload(surface: ChatSurfaceState) {
  return (
    Boolean(surface.focusedProjectId) ||
    (surface.visibleProjectIds?.length ?? 0) > 0 ||
    (surface.visibleExperienceIds?.length ?? 0) > 0 ||
    (surface.coreEvidenceIds?.length ?? 0) > 0 ||
    (surface.highlightedSkills?.length ?? 0) > 0
  );
}
