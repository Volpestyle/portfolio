'use client';

import { useState, useEffect } from 'react';
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
  const [showDevMode, setShowDevMode] = useState(false);
  const [isDev, setIsDev] = useState(false);

  // Check if we're in development mode
  useEffect(() => {
    setIsDev(process.env.NODE_ENV === 'development');
  }, []);

  // Only render once we have planner output (or later stages) so meta/greeting turns don't flash a user panel.
  const hasTraceContent =
    trace && (trace.plan || trace.retrieval || trace.evidence || trace.answerMeta || trace.error);
  const isMetaTurn =
    trace?.plan?.intent === 'meta' ||
    trace?.plan?.answerMode === 'meta_chitchat' ||
    trace?.answerMeta?.answerMode === 'meta_chitchat';
  const planReady = Boolean(trace?.plan);
  const streamingHasPlan = Boolean(isStreaming && trace && planReady);
  const shouldRenderTrace = Boolean(hasTraceContent || streamingHasPlan);
  const allowUserPanel = show && !isMetaTurn;
  const allowDevPanel = isDev && (showDevMode || isMetaTurn);
  const shouldRender = shouldRenderTrace && (allowUserPanel || allowDevPanel);

  // Keep hidden when nothing to render or visibility is off
  if (!shouldRender) {
    return null;
  }

  // Build effective trace - use empty trace for streaming state when no trace exists yet
  const effectiveTrace: PartialReasoningTrace = trace ?? {
    plan: null,
    retrieval: null,
    evidence: null,
    answerMeta: null,
    error: null,
  };

  // Force dev panel in dev_only mode
  const shouldShowDevPanel = allowDevPanel;
  const shouldHideUserPanel = !allowUserPanel;

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

      {/* Dev mode toggle (only in development with user_opt_in) */}
      {isDev && !isMetaTurn && (
        <button
          onClick={() => setShowDevMode(!showDevMode)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          <span>{showDevMode ? '← User view' : '→ Dev view'}</span>
        </button>
      )}
    </div>
  );
}
