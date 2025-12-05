'use client';

import type { ChatMessage, PartialReasoningTrace } from '@portfolio/chat-contract';
import type { ChatSurfaceState } from '@portfolio/chat-next-ui';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { ChatActionSurface } from '@/components/chat/ChatActionSurface';
import { InlineUiPortal, InlineUiPortalAnchor, InlineUiPortalProvider } from '@/components/chat/InlineUiPortal';
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
  const isDev = process.env.NODE_ENV === 'development';
  const surfaces = uiState.surfaces ?? [];
  const hasRenderableTrace = (trace: PartialReasoningTrace | null | undefined) => {
    if (!trace) return false;
    const planHasQueries = Boolean(trace.plan && (trace.plan.queries?.length ?? 0) > 0);
    const retrievalRan = Boolean(trace.retrieval && trace.retrieval.length);
    const answerWithPlan = Boolean(planHasQueries && trace.answer);
    return planHasQueries || retrievalRan || answerWithPlan || Boolean(trace.error);
  };
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

  // Show thinking spinner when busy and assistant hasn't started producing content (before streaming message exists)
  const lastMessage = messages[messages.length - 1];
  const lastMessageAssistant = lastMessage?.role === 'assistant' ? lastMessage : undefined;
  const assistantHasContent = lastMessageAssistant?.parts?.some((p) => p.kind === 'text' && p.text.trim().length > 0);
  const currentTrace = streamingAssistantMessageId ? reasoningTraces[streamingAssistantMessageId] : null;
  const hasRenderableCurrentTrace = hasRenderableTrace(currentTrace);
  const reasoningWillDisplay = reasoningEnabled && hasRenderableCurrentTrace;
  const showPendingThinking =
    isBusy && !assistantHasContent && !reasoningWillDisplay && !streamingAssistantMessageId;

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
          const nextTrace = nextMessage?.role === 'assistant' ? reasoningTraces[nextMessage.id] ?? null : null;
          const nextMessageHasUserReasoning =
            nextMessage?.role === 'assistant' &&
            streamingAssistantMessageId !== nextMessage.id &&
            hasRenderableTrace(nextTrace);
          const nextMessageHasDevReasoning =
            nextMessage?.role === 'assistant' && streamingAssistantMessageId !== nextMessage.id && isDev && Boolean(nextTrace);

          // Check if next message is the streaming assistant message
          const nextIsStreaming = nextMessage?.role === 'assistant' && nextMessage.id === streamingAssistantMessageId;
          const streamingTrace = streamingAssistantMessageId ? reasoningTraces[streamingAssistantMessageId] ?? null : null;
          const streamingHasUserReasoning = hasRenderableTrace(streamingTrace);
          const shouldRenderStreamingReasoning =
            nextIsStreaming && ((reasoningEnabled && streamingHasUserReasoning) || isDev);
          const shouldShowStreamingSpinner = nextIsStreaming && (!reasoningEnabled || !streamingHasUserReasoning);

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
                  {(nextMessageHasUserReasoning || nextMessageHasDevReasoning) && (
                    <ChatReasoningDisplay
                      trace={nextTrace}
                      show={reasoningEnabled}
                      isStreaming={false}
                      durationMs={calculateDuration(nextMessage)}
                    />
                  )}
                  {/* Streaming reasoning (if next message is the streaming one) */}
                  {nextIsStreaming ? (
                    <>
                      {shouldRenderStreamingReasoning ? (
                        <ChatReasoningDisplay
                          trace={streamingTrace}
                          show={reasoningEnabled}
                          isStreaming={true}
                        />
                      ) : null}
                      {shouldShowStreamingSpinner ? <ThinkingSpinner /> : null}
                    </>
                  ) : null}
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
        <InlineUiPortal key={surface.anchorId} anchorId={surface.anchorId} fallbackAnchorId={fallbackAnchorId}>
          <ChatActionSurface surface={surface} />
        </InlineUiPortal>
      ))}
    </InlineUiPortalProvider>
  );
}

function hasSurfacePayload(surface: ChatSurfaceState) {
  return (
    Boolean(surface.focusedProjectId) ||
    (surface.visibleProjectIds?.length ?? 0) > 0 ||
    (surface.visibleExperienceIds?.length ?? 0) > 0 ||
    (surface.visibleEducationIds?.length ?? 0) > 0 ||
    (surface.visibleLinkIds?.length ?? 0) > 0 ||
    (surface.highlightedSkills?.length ?? 0) > 0
  );
}
