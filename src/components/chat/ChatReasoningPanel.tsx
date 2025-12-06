'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  PartialReasoningTrace,
  RetrievedProjectDoc,
  RetrievedResumeDoc,
  CardSelectionReasoning,
  CardSelectionReason,
} from '@portfolio/chat-contract';
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
  const planQueries = plan?.queries?.filter((query) => query.source !== 'profile') ?? [];
  const retrievalDocs = trace.retrievalDocs ?? null;
  const answer = trace.answer ?? null;
  const traceError = trace.error ?? null;
  const streaming = trace.streaming ?? {};
  const plannerStreamingText = streaming.planner?.text || streaming.planner?.notes;
  const planThoughts = plan?.thoughts?.filter(Boolean) ?? [];
  const retrievalStreamingText = streaming.retrieval?.text || streaming.retrieval?.notes;
  const answerStreamingText = streaming.answer?.text || streaming.answer?.notes;

  // Determine current pipeline stage for spinner visibility
  // Only the current active stage should show a spinner
  const hasRetrieval = Boolean(trace.retrieval && trace.retrieval.length > 0);

  // Derive effective streaming state from trace content, not just the prop
  // This handles the case where typewriter finishes before reasoning completes
  // Key insight: if the trace is incomplete (no answer, no error), we're still streaming
  // even if the streaming text is temporarily empty (e.g., during schema parsing)
  const hasStartedProcessing = Boolean(plan || plannerStreamingText || retrievalStreamingText || answerStreamingText);
  const isIncomplete = !traceError && !answer;
  const effectivelyStreaming = isStreaming || (hasStartedProcessing && isIncomplete);

  const title = useMemo(() => {
    if (traceError) return 'Reasoning failed';
    if (effectivelyStreaming) return 'Thinking...';
    if (durationMs) {
      const seconds = Math.round(durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (seconds < 60) return `Thought for ${seconds}s`;
      return `Thought for ${minutes}m ${remainingSeconds}s`;
    }
    return 'How I answered';
  }, [durationMs, effectivelyStreaming, traceError]);

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
            ) : effectivelyStreaming ? (
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
          {effectivelyStreaming ? (
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
                isStreaming={effectivelyStreaming && !plan?.durationMs}
              >
                {plan ? (
                  <div className="space-y-2 text-xs text-white/70">
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
                    ) : null}
                    {plan.topic && <InfoRow label="Topic" value={plan.topic} />}
                  </div>
                ) : plannerStreamingText ? (
                  <StreamingNote text={plannerStreamingText} />
                ) : (
                  <LoadingState />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<Search className="h-4 w-4" />}
                title="Retrieval"
                isStreaming={effectivelyStreaming && !hasRetrieval}
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
                  <LoadingState />
                )}
              </ReasoningSection>

              <ReasoningSection
                icon={<BookOpen className="h-4 w-4" />}
                title="Answer"
                isStreaming={effectivelyStreaming && hasRetrieval && !answer?.durationMs}
              >
                {answer ? (
                  <div className="space-y-2 text-xs text-white/70">
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
                    <CardReasoningSection cardReasoning={answer.cardReasoning ?? undefined} />
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
                        ) : null;
                      })()
                    ) : null}
                    {answerStreamingText && effectivelyStreaming && (
                      <motion.span
                        className="inline-flex gap-0.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-blue-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-blue-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                        />
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-blue-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                        />
                      </motion.span>
                    )}
                  </div>
                ) : answerStreamingText ? (
                  <StreamingNote text={answerStreamingText} />
                ) : (
                  <LoadingState />
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

function LoadingState() {
  return (
    <div className="space-y-1.5">
      <motion.div
        className="h-3 w-3/4 rounded bg-white/10"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="h-3 w-1/2 rounded bg-white/10"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/50">{label}:</span>
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
  return (
    <div className="space-y-1">
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/70">{text}</p>
      <motion.span
        className="inline-flex gap-0.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-blue-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-blue-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
        />
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-blue-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      </motion.span>
    </div>
  );
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

function CardReasoningSection({ cardReasoning }: { cardReasoning?: CardSelectionReasoning }) {
  if (!cardReasoning) return null;

  const categories = [
    { key: 'projects', label: 'Projects', data: cardReasoning.projects, hideExcluded: false },
    { key: 'experiences', label: 'Experiences', data: cardReasoning.experiences, hideExcluded: false },
    { key: 'education', label: 'Education', data: cardReasoning.education, hideExcluded: false },
    { key: 'links', label: 'Links', data: cardReasoning.links, hideExcluded: true },
  ].filter((c) => c.data && ((c.data.included?.length ?? 0) > 0 || (c.data.excluded?.length ?? 0) > 0));

  if (categories.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-[11px] font-medium text-white/60">Card Selection</h5>
      {categories.map(({ key, label, data, hideExcluded }) => (
        <CollapsibleCardReasoning
          key={key}
          label={label}
          included={data?.included ?? []}
          excluded={data?.excluded ?? []}
          hideExcluded={hideExcluded}
        />
      ))}
    </div>
  );
}

function CollapsibleCardReasoning({
  label,
  included,
  excluded,
  hideExcluded = false,
}: {
  label: string;
  included: CardSelectionReason[];
  excluded: CardSelectionReason[];
  hideExcluded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const showExcluded = !hideExcluded && excluded.length > 0;

  return (
    <div className="rounded border border-white/10 bg-white/5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-medium text-white/70 hover:bg-white/5"
      >
        <span>
          {label} ({included.length} shown{!hideExcluded ? `, ${excluded.length} excluded` : ''})
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
            <div className="space-y-2 border-t border-white/10 p-2">
              {included.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-green-400">Included</span>
                  {included.map((item) => (
                    <div key={item.id} className="rounded bg-green-500/10 p-1.5">
                      <span className="text-xs font-medium text-white/80">{item.name}</span>
                      <p className="text-[11px] text-white/60">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
              {showExcluded && (
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-red-400/80">Excluded</span>
                  {excluded.map((item) => (
                    <div key={item.id} className="rounded bg-red-500/10 p-1.5">
                      <span className="text-xs font-medium text-white/60">{item.name}</span>
                      <p className="text-[11px] text-white/50">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
