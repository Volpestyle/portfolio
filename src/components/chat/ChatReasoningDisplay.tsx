'use client';

import { useEffect, useState } from 'react';
import type { PartialReasoningTrace } from '@portfolio/chat-contract';
import { ChatReasoningPanel } from './ChatReasoningPanel';
import { ChatReasoningDevPanel } from './ChatReasoningDevPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ChatReasoningDisplayProps {
  trace: PartialReasoningTrace | null;
  show?: boolean;
  isStreaming?: boolean;
  durationMs?: number;
  className?: string;
}

/**
 * ChatReasoningDisplay - Displays reasoning traces when permitted by the caller.
 */
export function ChatReasoningDisplay({
  trace,
  show = true,
  isStreaming = false,
  durationMs,
  className,
}: ChatReasoningDisplayProps) {
  const isDev = process.env.NODE_ENV === 'development';
  const [showDevMode, setShowDevMode] = useState(false);

  // Persist dev/user view preference in dev only
  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('chat:reasoningDevMode');
    if (stored === '1') {
      setShowDevMode(true);
    }
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setShowDevMode(detail.enabled);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'chat:reasoningDevMode') {
        setShowDevMode(event.newValue === '1');
      }
    };
    window.addEventListener('chat:reasoningDevModeChanged', handler as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('chat:reasoningDevModeChanged', handler as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;
    try {
      if (showDevMode) {
        window.localStorage.setItem('chat:reasoningDevMode', '1');
      } else {
        window.localStorage.removeItem('chat:reasoningDevMode');
      }
    } catch {
      // ignore storage errors
    }
  }, [isDev, showDevMode]);

  const hasRenderablePlan = Boolean(trace?.plan && (trace.plan.queries?.length ?? 0) > 0);
  const hasRetrieval = Boolean(trace?.retrieval && trace.retrieval.length);
  const hasAnswerWithQueries = Boolean(hasRenderablePlan && trace?.answer);
  const hasError = Boolean(trace?.error);

  // Only render when planner chose to search, retrieval ran, or there was an error.
  const hasTraceContent = hasRenderablePlan || hasRetrieval || hasAnswerWithQueries || hasError;
  const streamingHasPlan = Boolean(isStreaming && hasRenderablePlan);
  const shouldRenderUserPanel = Boolean(show && (hasTraceContent || streamingHasPlan));
  const hasTracePayload = trace !== null && trace !== undefined;
  const allowDevPanel = isDev && showDevMode;
  const shouldRenderDevPanel = allowDevPanel && (hasTracePayload || isStreaming);

  const hasAnyPanel = shouldRenderUserPanel || shouldRenderDevPanel;
  const shouldRenderContainer = hasAnyPanel || isDev;

  // Keep hidden when nothing to render (non-dev)
  if (!shouldRenderContainer) {
    return null;
  }

  // Build effective trace - use empty trace for streaming state when no trace exists yet
  const effectiveTrace: PartialReasoningTrace = trace ?? {
    plan: null,
    retrieval: null,
    answer: null,
    debug: null,
    error: null,
  };

  // Force dev panel in dev_only mode
  const shouldShowDevPanel = shouldRenderDevPanel;
  const shouldShowUserPanel = shouldRenderUserPanel && show;
  const shouldHideUserPanel = !shouldShowUserPanel;

  return (
    <div className={cn('w-full space-y-2', className)}>
      <AnimatePresence mode="wait">
        {shouldShowDevPanel ? (
          <motion.div
            key="dev-panel"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            <ChatReasoningDevPanel trace={effectiveTrace} isStreaming={isStreaming} />
          </motion.div>
        ) : shouldHideUserPanel ? null : (
          <motion.div
            key="user-panel"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            <ChatReasoningPanel trace={effectiveTrace} isStreaming={isStreaming} durationMs={durationMs} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
