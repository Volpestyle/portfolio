'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { ChevronDown, Code, Database, Brain, BookOpen } from 'lucide-react';

interface ChatReasoningDevPanelProps {
  trace: PartialReasoningTrace;
  isStreaming?: boolean;
  className?: string;
}

export function ChatReasoningDevPanel({ trace, isStreaming = false, className }: ChatReasoningDevPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!trace.plan) {
    return null;
  }

  const plan = trace.plan;
  const retrievals = trace.retrieval ?? [];
  const answer = trace.answer ?? null;

  return (
    <div className={cn('w-full rounded-lg border border-purple-500/30 bg-purple-950/20 backdrop-blur-sm', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-purple-500/10"
      >
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-200">Dev: Full Reasoning Trace</span>
          {isStreaming && (
            <div className="relative h-2 w-2">
              <div className="absolute inset-0 animate-pulse rounded-full bg-purple-400" />
            </div>
          )}
        </div>
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-purple-300" />
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
            <div className="space-y-3 border-t border-purple-500/20 px-4 py-3">
              <DevSection icon={<Brain className="h-4 w-4" />} title="Planner Output">
                <div className="space-y-3 text-xs text-purple-200">
                  <KeyValue label="cardsEnabled" value={plan.cardsEnabled !== false ? 'true' : 'false'} />
                  {plan.topic && <KeyValue label="topic" value={plan.topic} />}
                  {plan.queries.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-purple-300">queries:</p>
                      <div className="space-y-2">
                        {plan.queries.map((q, idx) => (
                          <div key={idx} className="rounded border border-purple-500/20 bg-purple-950/30 p-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-purple-400">source:</span>
                              <span className="text-purple-200">{q.source}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-400">limit:</span>
                              <span className="text-purple-200">{q.limit ?? '—'}</span>
                            </div>
                            <div className="mt-1">
                              <span className="text-purple-400">text:</span>
                              <p className="mt-1 text-purple-200">{q.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <JsonCollapsible data={plan} label="Full JSON" />
              </DevSection>

              <DevSection icon={<Database className="h-4 w-4" />} title="Retrieval Results">
                {retrievals.length === 0 ? (
                  <DevPlaceholder>No retrieval results</DevPlaceholder>
                ) : (
                  <>
                    <div className="space-y-2">
                      {retrievals.map((r, idx) => (
                        <div key={idx} className="rounded border border-purple-500/20 bg-purple-950/30 p-2">
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-purple-400">source:</span>
                              <span className="font-medium text-purple-200">{r.source}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-400">requestedTopK:</span>
                              <span className="text-purple-200">{r.requestedTopK}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-400">effectiveTopK:</span>
                              <span className="text-purple-200">{r.effectiveTopK}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-400">numResults:</span>
                              <span className="text-purple-200">{r.numResults}</span>
                            </div>
                            <div className="mt-1">
                              <span className="text-purple-400">queryText:</span>
                              <p className="mt-1 text-purple-200">{r.queryText}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <JsonCollapsible data={retrievals} label="Full JSON" />
                  </>
                )}
              </DevSection>

              <DevSection icon={<BookOpen className="h-4 w-4" />} title="Answer">
                {answer ? (
                  <div className="space-y-2 text-xs text-purple-200">
                    <KeyValue label="message" value={answer.message} />
                    {answer.uiHints && (
                      <div className="flex gap-4 text-[11px] text-purple-300">
                        <span>projects: {answer.uiHints.projects?.length ?? 0}</span>
                        <span>experiences: {answer.uiHints.experiences?.length ?? 0}</span>
                      </div>
                    )}
                    {answer.thoughts && answer.thoughts.length > 0 && (
                      <div className="space-y-1">
                        {answer.thoughts.map((thought, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-purple-400">{idx + 1}.</span>
                            <span>{thought}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <DevPlaceholder>Answer not ready</DevPlaceholder>
                )}
                {answer && <JsonCollapsible data={answer} label="Full JSON" />}
              </DevSection>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DevSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-purple-200">
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value?: string }) {
  if (value === undefined) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-purple-400">{label}</span>
      <span className="text-purple-100">{value}</span>
    </div>
  );
}

function JsonCollapsible({ data, label }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-purple-500/20 bg-purple-950/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-2 py-1 text-left text-[11px] font-medium text-purple-200"
      >
        <span>{label ?? 'JSON'}</span>
        <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-auto px-2 pb-2 text-[11px] text-purple-100"
          >
            {JSON.stringify(data, null, 2)}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}

function DevPlaceholder({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-purple-200/70">{children}</p>;
}
