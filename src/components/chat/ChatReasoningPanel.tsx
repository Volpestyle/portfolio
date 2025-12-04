'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { AlertTriangle, Brain, ChevronDown, Search, Sparkles, BookOpen } from 'lucide-react';

interface ChatReasoningPanelProps {
  trace: PartialReasoningTrace;
  isStreaming?: boolean;
  durationMs?: number;
  className?: string;
}

const STAGE_PROGRESS = {
  idle: 0,
  planner: 0.33,
  retrieval: 0.66,
  answer: 1,
};

export function ChatReasoningPanel({ trace, isStreaming = false, durationMs, className }: ChatReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const plan = trace.plan;
  const retrievals = trace.retrieval ?? null;
  const answer = trace.answer ?? null;
  const traceError = trace.error ?? null;

  const progress = useMemo(() => {
    if (answer) return STAGE_PROGRESS.answer;
    if (retrievals) return STAGE_PROGRESS.retrieval;
    if (plan) return STAGE_PROGRESS.planner;
    return STAGE_PROGRESS.idle;
  }, [answer, retrievals, plan]);

  const title = useMemo(() => {
    if (traceError) return 'Reasoning failed';
    if (isStreaming) return 'Thinking...';
    if (durationMs) {
      const seconds = Math.round(durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (seconds < 60) return `Thought for ${seconds}s`;
      return `Thought for ${minutes}m ${remainingSeconds}s`;
    }
    return 'How I answered';
  }, [durationMs, isStreaming, traceError]);

  const hasQueries = (plan?.queries?.length ?? 0) > 0;

  return (
    <div className={cn('w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <ProgressArc progress={progress} isStreaming={isStreaming} />
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {traceError ? (
                <motion.div
                  key="error"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="relative flex h-4 w-4 items-center justify-center"
                >
                  <AlertTriangle className="h-4 w-4 text-red-300" />
                </motion.div>
              ) : isStreaming ? (
                <motion.div
                  key="thinking"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="relative h-4 w-4"
                >
                  <StagePulse stage={answer ? 'answer' : retrievals ? 'retrieval' : plan ? 'planner' : 'planner'} />
                </motion.div>
              ) : (
                <motion.div
                  key="done"
                  initial={{ scale: 0, rotate: -180, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0, rotate: 180, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <Brain className="h-4 w-4 text-blue-400" />
                </motion.div>
              )}
            </AnimatePresence>
            <span className="text-sm font-medium text-white/90">{title}</span>
          </div>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-white/60" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-white/10 px-4 py-3">
              {traceError && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <div className="space-y-1">
                    <p className="font-semibold">Reasoning failed.</p>
                    <p className="text-red-100/80">{traceError?.message}</p>
                  </div>
                </div>
              )}

              <ReasoningSection
                icon={<Sparkles className="h-4 w-4" />}
                title="Planner"
                isStreaming={isStreaming && !plan}
              >
                {plan ? (
                  <div className="space-y-2 text-xs text-white/70">
                    <InfoRow label="Cards" value={plan.cardsEnabled === false ? 'Disabled' : 'Enabled'} />
                    {plan.topic && <InfoRow label="Topic" value={plan.topic} />}
                    {hasQueries ? (
                      <div className="space-y-1">
                        {plan.queries.map((query, idx) => (
                          <div key={`${query.source}-${idx}`} className="rounded border border-white/5 bg-white/5 p-2">
                            <div className="flex items-center justify-between text-[11px] text-white/60">
                              <span className="font-semibold text-blue-200">{query.source}</span>
                              <span>TopK: {query.limit ?? '—'}</span>
                            </div>
                            <p className="mt-1 text-xs text-white/70">{query.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/60">Planner chose to skip retrieval.</p>
                    )}
                  </div>
                ) : (
                  <LoadingState status="Analyzing your question..." />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<Search className="h-4 w-4" />}
                title="Retrieval"
                isStreaming={isStreaming && !retrievals}
              >
                {retrievals ? (
                  <div className="space-y-2">
                    {retrievals.length === 0 ? (
                      <p className="text-xs text-white/60">No portfolio lookups were needed.</p>
                    ) : (
                      retrievals.map((r, idx) => (
                        <div key={`${r.source}-${idx}`} className="rounded-md border border-white/5 bg-white/5 p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-blue-300">{capitalize(r.source)}</span>
                            <span className="text-xs text-white/40">
                              {r.numResults} result{r.numResults !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-white/70">{r.queryText}</p>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <LoadingState status="Searching portfolio..." />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<BookOpen className="h-4 w-4" />}
                title="Answer hints"
                isStreaming={isStreaming && !answer}
              >
                {answer ? (
                  <div className="space-y-2 text-xs text-white/70">
                    {answer.uiHints && (answer.uiHints.projects?.length || answer.uiHints.experiences?.length) ? (
                      <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
                        <span>
                          Projects: {answer.uiHints.projects?.length ?? 0}
                        </span>
                        <span>Experiences: {answer.uiHints.experiences?.length ?? 0}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-white/60">No cards suggested for this turn.</p>
                    )}
                    {answer.thoughts && answer.thoughts.length > 0 && (
                      <div className="space-y-1">
                        {answer.thoughts.map((thought, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-medium text-blue-300">
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-white/80">{thought}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <LoadingState status="Drafting answer..." />
                )}
              </ReasoningSection>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReasoningSection({ icon, title, children, isStreaming }: { icon: React.ReactNode; title: string; children: React.ReactNode; isStreaming?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.div
              key="loading"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              className="relative flex h-4 w-5 items-center justify-center"
            >
              <motion.div
                className="absolute h-3 w-3 rounded-full border-2 border-blue-400/30"
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="h-1 w-1 rounded-full bg-blue-400"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="done"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="text-blue-400"
            >
              {icon}
            </motion.div>
          )}
        </AnimatePresence>
        <h4 className="text-xs font-semibold text-white/80">{title}</h4>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function LoadingState({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-4 w-4">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-400/80" />
      </div>
      <span className="text-xs text-white/50">{status}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/50">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

function StagePulse({ stage }: { stage: 'planner' | 'retrieval' | 'answer' }) {
  if (stage === 'planner') {
    return (
      <motion.div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-blue-400"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 0.8,
              delay: i * 0.15,
              repeat: Infinity,
            }}
          />
        ))}
      </motion.div>
    );
  }
  if (stage === 'retrieval') {
    return (
      <motion.div className="relative h-4 w-16 overflow-hidden rounded bg-white/5">
        <motion.div
          className="absolute inset-y-0 w-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
          animate={{ x: [0, 64, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    );
  }
  return (
    <motion.span
      className="inline-block h-3 w-0.5 bg-blue-400"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
    />
  );
}

function ProgressArc({ progress, isStreaming }: { progress: number; isStreaming: boolean }) {
  const circumference = 2 * Math.PI * 6;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <svg className="h-5 w-5 -rotate-90 text-white/50" viewBox="0 0 16 16" role="progressbar" aria-valuenow={progress}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
      <motion.circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ strokeDashoffset }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="text-blue-400"
      />
      {isStreaming && (
        <motion.circle
          cx="8"
          cy="2"
          r="1.5"
          fill="currentColor"
          className="text-blue-400"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{
            transformOrigin: '8px 8px',
            rotate: `${progress * 360}deg`,
          }}
        />
      )}
    </svg>
  );
}

function capitalize(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
