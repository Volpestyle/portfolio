'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace, RetrievedProjectDoc, RetrievedResumeDoc } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { AlertTriangle, Brain, ChevronDown, Search, BookOpen, ClipboardList } from 'lucide-react';

interface ChatReasoningPanelProps {
  trace: PartialReasoningTrace;
  isStreaming?: boolean;
  durationMs?: number;
  className?: string;
}

export function ChatReasoningPanel({ trace, isStreaming = false, durationMs, className }: ChatReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const plan = trace.plan;
  const retrievals = trace.retrieval ?? null;
  const planQueries = plan?.queries?.filter((query) => query.source !== 'profile') ?? [];
  const retrievalDocs = trace.retrievalDocs ?? null;
  const answer = trace.answer ?? null;
  const traceError = trace.error ?? null;
  const streaming = trace.streaming ?? {};
  const plannerStreamingText = streaming.planner?.text || streaming.planner?.notes;
  const planThoughts = plan?.thoughts?.filter(Boolean) ?? [];
  const retrievalStreamingText = streaming.retrieval?.text || streaming.retrieval?.notes;
  const answerStreamingText = streaming.answer?.text || streaming.answer?.notes;

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

  const hasQueries = planQueries.length > 0;

  return (
    <div className={cn('w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {traceError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-4 w-4 items-center justify-center"
              >
                <AlertTriangle className="h-4 w-4 text-red-300" />
              </motion.div>
            ) : isStreaming ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-4 w-4"
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Brain className="h-4 w-4 text-blue-400" />
              </motion.div>
            )}
          </AnimatePresence>
          {isStreaming ? (
            <span className="relative text-sm font-medium text-white/60">
              {title}
              <motion.span
                className="absolute inset-0 text-sm font-medium text-white/90"
                style={{
                  backgroundImage: 'linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundSize: '200% 100%',
                }}
                animate={{ backgroundPosition: ['100% 0%', '-100% 0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              >
                {title}
              </motion.span>
            </span>
          ) : (
            <span className="text-sm font-medium text-white/90">{title}</span>
          )}
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
                icon={<ClipboardList className="h-4 w-4" />}
                title="Planner"
                isStreaming={isStreaming && !plan}
              >
                {plan ? (
                  <div className="space-y-2 text-xs text-white/70">
                    {plan.topic && <InfoRow label="Topic" value={plan.topic} />}
                    {hasQueries ? (
                      <div className="space-y-1">
                        {planQueries.map((query, idx) => (
                          <div key={`${query.source}-${idx}`} className="rounded border border-white/5 bg-white/5 p-2">
                            <div className="flex items-center justify-between text-[11px] text-white/60">
                              <span className="font-semibold text-blue-200">{capitalize(query.source)}</span>
                              {query.text && <span>TopK: {query.limit ?? '—'}</span>}
                            </div>
                            {query.text ? (
                              <p className="mt-1 text-xs text-white/70">{query.text}</p>
                            ) : (
                              <p className="mt-1 text-xs text-white/50 italic">No query text provided</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/60">Planner chose to skip retrieval.</p>
                    )}
                    {planThoughts.length > 0 && (
                      <div className="space-y-1">
                        {planThoughts.map((thought, idx) => (
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
                ) : plannerStreamingText ? (
                  <StreamingNote text={plannerStreamingText} />
                ) : (
                  <LoadingState status="Analyzing your question..." />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<Search className="h-4 w-4" />}
                title="Retrieval"
                isStreaming={isStreaming && !retrievals}
              >
                {retrievalDocs ? (
                  <div className="space-y-2">
                    {retrievalDocs.projects && retrievalDocs.projects.length > 0 && (
                      <CollapsibleDocList
                        title="Projects"
                        items={retrievalDocs.projects}
                        renderItem={(doc) => <ProjectDocItem doc={doc} />}
                      />
                    )}
                    {retrievalDocs.resume && retrievalDocs.resume.length > 0 && (
                      <CollapsibleDocList
                        title="Resume"
                        items={retrievalDocs.resume}
                        renderItem={(doc) => <ResumeDocItem doc={doc} />}
                      />
                    )}
                    {!retrievalDocs.projects?.length && !retrievalDocs.resume?.length && (
                      <p className="text-xs text-white/60">No documents retrieved.</p>
                    )}
                  </div>
                ) : retrievalStreamingText ? (
                  <StreamingNote text={retrievalStreamingText} />
                ) : (
                  <LoadingState status="Searching portfolio..." />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<BookOpen className="h-4 w-4" />}
                title="Answer"
                isStreaming={isStreaming && !answer}
              >
                {answer ? (
                  <div className="space-y-2 text-xs text-white/70">
                    {answer.uiHints ? (
                      (() => {
                        const projects = answer.uiHints.projects?.length ?? 0;
                        const experiences = answer.uiHints.experiences?.length ?? 0;
                        const links = answer.uiHints.links?.length ?? 0;
                        const hasUi = projects > 0 || experiences > 0 || links > 0;
                        return hasUi ? (
                          <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
                            <span>Projects: {projects}</span>
                            <span>Experiences: {experiences}</span>
                            <span>Links: {links}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-white/60">No cards suggested for this turn.</p>
                        );
                      })()
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
                ) : answerStreamingText ? (
                  <StreamingNote text={answerStreamingText} />
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

function ReasoningSection({
  icon,
  title,
  children,
  isStreaming,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  isStreaming?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-4 w-4 items-center justify-center"
            >
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
            </motion.div>
          ) : (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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

function capitalize(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StreamingNote({ text }: { text: string }) {
  if (!text) return null;
  return <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/60">{text}</p>;
}

function CollapsibleDocList<T extends { id: string }>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded border border-white/10 bg-white/5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-medium text-white/70 hover:bg-white/5"
      >
        <span>
          {title} ({items.length})
        </span>
        <ChevronDown
          className="h-3 w-3 text-white/40 transition-transform"
          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-white/10 px-2.5 py-2">
              {items.map((item) => (
                <div key={item.id}>{renderItem(item)}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectDocItem({ doc }: { doc: RetrievedProjectDoc }) {
  return (
    <div className="rounded border border-white/5 bg-white/5 p-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-blue-200">{doc.name}</span>
        {doc._score !== undefined && (
          <span className="shrink-0 text-[10px] text-white/40">{(doc._score * 100).toFixed(0)}%</span>
        )}
      </div>
      {doc.oneLiner && <p className="mt-1 text-[11px] leading-relaxed text-white/60">{doc.oneLiner}</p>}
      {doc.techStack && doc.techStack.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {doc.techStack.map((tech) => (
            <span key={tech} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
              {tech}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumeDocItem({ doc }: { doc: RetrievedResumeDoc }) {
  const typeLabel = doc.type ? capitalize(doc.type) : 'Entry';
  const headline = doc.title || doc.company || doc.institution || 'Untitled';
  const subtitle = doc.company || doc.institution;

  return (
    <div className="rounded border border-white/5 bg-white/5 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[9px] font-medium text-blue-300">
              {typeLabel}
            </span>
            <span className="truncate text-xs font-medium text-white/80">{headline}</span>
          </div>
          {subtitle && doc.title && subtitle !== doc.title && (
            <p className="mt-0.5 text-[11px] text-white/50">{subtitle}</p>
          )}
        </div>
        {doc._score !== undefined && (
          <span className="shrink-0 text-[10px] text-white/40">{(doc._score * 100).toFixed(0)}%</span>
        )}
      </div>
      {doc.summary && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/60">{doc.summary}</p>}
    </div>
  );
}
