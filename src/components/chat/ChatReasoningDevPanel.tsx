'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  PartialReasoningTrace,
  RetrievedProjectDoc,
  RetrievedResumeDoc,
  CardSelectionReasoning,
  CardSelectionReason,
} from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { AlertTriangle, BookOpen, Brain, ChevronDown, Code, Database } from 'lucide-react';

interface ChatReasoningDevPanelProps {
  trace: PartialReasoningTrace;
  isStreaming?: boolean;
  className?: string;
}

export function ChatReasoningDevPanel({ trace, isStreaming = false, className }: ChatReasoningDevPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const plan = trace.plan;
  const retrievals = trace.retrieval ?? [];
  const answer = trace.answer ?? null;
  const traceError = trace.error ?? null;
  const debug = trace.debug ?? null;
  const retrievalDocs = trace.retrievalDocs ?? null;
  const plannerThoughts = plan?.thoughts?.filter(Boolean) ?? [];
  const streaming = trace.streaming ?? {};
  const plannerStreamingText = streaming.planner?.text || streaming.planner?.notes;
  const retrievalStreamingText = streaming.retrieval?.text || streaming.retrieval?.notes;
  const answerStreamingText = streaming.answer?.text || streaming.answer?.notes;

  // Determine current pipeline stage for spinner visibility
  // Only the current active stage should show a spinner
  const hasRetrieval = trace.retrieval !== undefined;
  const answerStarted = Boolean(answerStreamingText) || answer !== null;

  // Derive effective streaming state from trace content, not just the prop
  // Key insight: if the trace is incomplete (no answer, no error), we're still streaming
  // even if the streaming text is temporarily empty (e.g., during schema parsing)
  const hasStartedProcessing = Boolean(plan || plannerStreamingText || retrievalStreamingText || answerStreamingText);
  const isIncomplete = !traceError && !answer;
  const effectivelyStreaming = isStreaming || (hasStartedProcessing && isIncomplete);

  const hasData = Boolean(plan || retrievals.length || answer || traceError || debug);
  const isPlannerStreaming = effectivelyStreaming && !hasRetrieval;
  const isRetrievalStreaming = effectivelyStreaming && hasRetrieval && !answerStarted;
  const isAnswerStreaming = effectivelyStreaming && (Boolean(answerStreamingText) || (hasRetrieval && !answer));

  return (
    <div className={cn('w-full rounded-lg border border-purple-500/20 bg-purple-950/20', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-purple-500/5"
      >
        <div className="flex items-center gap-3">
          <Code className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-100">Dev Trace</span>
          {!hasData && <span className="text-xs text-purple-300/50">Awaiting...</span>}
          {effectivelyStreaming && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-purple-300/60 transition-transform', isExpanded && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-purple-500/10 px-4 py-3">
              {traceError && <ErrorBanner error={traceError} />}

              <DevSection icon={<Brain className="h-4 w-4" />} title="Planner" isStreaming={isPlannerStreaming}>
                {plan ? (
                  <div className="space-y-2">
                    <ModelMeta
                      model={plan.model}
                      effort={plan.effort}
                      usage={plan.usage}
                      durationMs={plan.durationMs}
                      costUsd={plan.costUsd}
                    />
                    {plannerThoughts.length > 0 && (
                      <div className="space-y-1">
                        {plannerThoughts.map((thought, idx) => (
                          <div key={idx} className="flex gap-2 text-xs">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-medium text-purple-300">
                              {idx + 1}
                            </span>
                            <span className="text-purple-100/70">{thought}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {plan.queries.length > 0 && (
                      <div className="space-y-1.5">
                        {plan.queries.map((q, idx) => (
                          <div key={`${q.source}-${idx}`} className="rounded border border-purple-500/10 bg-purple-950/30 p-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-medium text-purple-200">{capitalize(q.source)}</span>
                              <span className="text-purple-300/50">topK: {q.limit ?? '—'}</span>
                            </div>
                            <p className="mt-1 text-xs text-purple-100/70">{q.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {plan.topic && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-purple-300/60">Topic: <span className="text-purple-100">{plan.topic}</span></span>
                      </div>
                    )}
                    <Collapsible label="Planner JSON">{JSON.stringify(plan, null, 2)}</Collapsible>
                    {debug?.plannerPrompt && (
                      <div className="space-y-1.5">
                        <Collapsible label="System prompt">{debug.plannerPrompt.system}</Collapsible>
                        <Collapsible label="User prompt">{debug.plannerPrompt.user}</Collapsible>
                      </div>
                    )}
                    {debug?.plannerRawResponse && <Collapsible label="Raw LLM response">{debug.plannerRawResponse}</Collapsible>}
                  </div>
                ) : plannerStreamingText ? (
                  <StreamingText text={plannerStreamingText} />
                ) : (
                  <LoadingPlaceholder />
                )}
              </DevSection>

              <DevSection icon={<Database className="h-4 w-4" />} title="Retrieval" isStreaming={isRetrievalStreaming}>
                {trace.retrieval !== undefined ? (
                  <div className="space-y-2">
                    {retrievals[0]?.embeddingModel && (
                      <p className="text-xs text-purple-300/60">Model: <span className="text-purple-100">{retrievals[0].embeddingModel}</span></p>
                    )}
                    {retrievals.length === 0 ? (
                      <p className="text-xs text-purple-300/50">No retrievals</p>
                    ) : (
                      <div className="space-y-1.5">
                        {retrievalDocs?.projects && retrievalDocs.projects.length > 0 && (
                          <DocsDropdown label={`Projects (${retrievalDocs.projects.length})`} docs={retrievalDocs.projects} renderDoc={renderProjectDoc} />
                        )}
                        {retrievalDocs?.resume && retrievalDocs.resume.length > 0 && (
                          <DocsDropdown label={`Resume (${retrievalDocs.resume.length})`} docs={retrievalDocs.resume} renderDoc={renderResumeDoc} />
                        )}
                        {!retrievalDocs && (
                          <div className="flex flex-wrap gap-2">
                            {retrievals.map((r, idx) => (
                              <div key={`${r.source}-${idx}`} className="rounded border border-purple-500/10 bg-purple-950/30 px-2 py-1">
                                <span className="text-xs font-medium text-purple-200">{capitalize(r.source)}</span>
                                <span className="ml-1.5 text-xs text-purple-300/50">{r.numResults}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {retrievals.length > 0 && <Collapsible label="Retrieval JSON">{JSON.stringify(retrievals, null, 2)}</Collapsible>}
                  </div>
                ) : retrievalStreamingText ? (
                  <StreamingText text={retrievalStreamingText} />
                ) : (
                  <LoadingPlaceholder />
                )}
              </DevSection>

              <DevSection icon={<BookOpen className="h-4 w-4" />} title="Answer" isStreaming={isAnswerStreaming}>
                {answer ? (
                  <div className="space-y-2">
                    <ModelMeta
                      model={answer.model}
                      effort={answer.effort}
                      usage={answer.usage}
                      durationMs={answer.durationMs}
                      costUsd={answer.costUsd}
                    />
                    {answer.thoughts && answer.thoughts.length > 0 && (
                      <div className="space-y-1">
                        {answer.thoughts.map((thought, idx) => (
                          <div key={idx} className="flex gap-2 text-xs">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-medium text-purple-300">
                              {idx + 1}
                            </span>
                            <span className="text-purple-100/70">{thought}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <CardReasoningDevSection cardReasoning={answer.cardReasoning ?? undefined} />
                    {answer.uiHints && (
                      <div className="flex gap-3 text-xs text-purple-300/60">
                        <span>Projects: <span className="text-purple-100">{answer.uiHints.projects?.length ?? 0}</span></span>
                        <span>Experiences: <span className="text-purple-100">{answer.uiHints.experiences?.length ?? 0}</span></span>
                        <span>Links: <span className="text-purple-100">{answer.uiHints.links?.length ?? 0}</span></span>
                      </div>
                    )}
                    <Collapsible label="Answer JSON">{JSON.stringify(answer, null, 2)}</Collapsible>
                    {debug?.answerPrompt && (
                      <div className="space-y-1.5">
                        <Collapsible label="System prompt">{debug.answerPrompt.system}</Collapsible>
                        <Collapsible label="User prompt">{debug.answerPrompt.user}</Collapsible>
                      </div>
                    )}
                    {debug?.answerRawResponse && <Collapsible label="Raw LLM response">{debug.answerRawResponse}</Collapsible>}
                    {answerStreamingText && effectivelyStreaming && (
                      <motion.span
                        className="inline-flex gap-0.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-purple-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-purple-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                        />
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-purple-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                        />
                      </motion.span>
                    )}
                  </div>
                ) : answerStreamingText ? (
                  <StreamingText text={answerStreamingText} />
                ) : (
                  <LoadingPlaceholder />
                )}
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
        {isStreaming ? (
          <div className="h-4 w-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500/20 border-t-purple-400" />
          </div>
        ) : (
          <span className="text-purple-400">{icon}</span>
        )}
        <h4 className="text-xs font-semibold text-purple-100/80">{title}</h4>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function ModelMeta({
  model,
  effort,
  usage,
  durationMs,
  costUsd,
}: {
  model?: string;
  effort?: string | null;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  durationMs?: number;
  costUsd?: number;
}) {
  const tokens = usage ? formatTokens(usage) : null;
  const duration = formatDuration(durationMs);
  const cost = formatCost(costUsd);

  if (!model && !effort && !tokens && !duration && !cost) {
    return null;
  }

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {model && (
        <>
          <span className="text-purple-300/60">Model</span>
          <span className="text-purple-100">{model}</span>
        </>
      )}
      {effort && (
        <>
          <span className="text-purple-300/60">Effort</span>
          <span className="text-purple-100">{capitalize(effort)}</span>
        </>
      )}
      {tokens && (
        <>
          <span className="text-purple-300/60">Tokens</span>
          <span className="text-purple-100">{tokens}</span>
        </>
      )}
      {duration && (
        <>
          <span className="text-purple-300/60">Time</span>
          <span className="text-purple-100">{duration}</span>
        </>
      )}
      {cost && (
        <>
          <span className="text-purple-300/60">Cost</span>
          <span className="text-purple-100">{cost}</span>
        </>
      )}
    </div>
  );
}

function ErrorBanner({ error }: { error: PartialReasoningTrace['error'] }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
      <div>
        <p className="font-semibold">{error.stage ? `${capitalize(error.stage)} failed` : 'Error'}</p>
        {error.message && <p className="mt-0.5 text-red-100/70">{error.message}</p>}
      </div>
    </div>
  );
}

function Collapsible({ label, children }: { label: string; children: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <div className="rounded border border-purple-500/10 bg-purple-950/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-medium text-purple-100/70 hover:bg-purple-500/5"
      >
        <span>{label}</span>
        <ChevronDown className={cn('h-3 w-3 text-purple-300/40 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-h-60 overflow-auto whitespace-pre-wrap border-t border-purple-500/10 px-2 py-2 text-[11px] leading-relaxed text-purple-50/80"
          >
            {children}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTokens(usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) {
  const prompt = usage.promptTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  const total = usage.totalTokens ?? prompt + completion;
  if (!prompt && !completion && !total) return null;
  return `${prompt.toLocaleString()} in / ${completion.toLocaleString()} out (${total.toLocaleString()} total)`;
}

function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
  }
  return `${Math.round(value)}ms`;
}

function formatCost(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
  if (value < 0.001) return '<$0.001';
  return `$${value.toFixed(3)}`;
}

function capitalize(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LoadingPlaceholder() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-500/20 border-t-purple-400" />
        <span className="text-xs text-purple-300/40">Waiting...</span>
      </div>
      <div className="space-y-1.5">
        <motion.div
          className="h-2.5 w-3/4 rounded bg-purple-500/10"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="h-2.5 w-1/2 rounded bg-purple-500/10"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        />
      </div>
    </div>
  );
}

function StreamingText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="space-y-1">
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-purple-100/70">{text}</p>
      <motion.span
        className="inline-flex gap-0.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-purple-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-purple-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
        />
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-purple-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      </motion.span>
    </div>
  );
}

function DocsDropdown<T>({
  label,
  docs,
  renderDoc,
}: {
  label: string;
  docs: T[];
  renderDoc: (doc: T, idx: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-purple-500/10 bg-purple-950/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-medium text-purple-100/70 hover:bg-purple-500/5"
      >
        <span>{label}</span>
        <ChevronDown className={cn('h-3 w-3 text-purple-300/40 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-h-60 overflow-auto border-t border-purple-500/10"
          >
            <div className="space-y-1 p-2">
              {docs.map((doc, idx) => renderDoc(doc, idx))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function renderProjectDoc(doc: RetrievedProjectDoc) {
  return (
    <div key={doc.id} className="rounded border border-purple-500/10 bg-purple-900/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-purple-100">{doc.name}</span>
        {typeof doc._score === 'number' && (
          <span className="text-[10px] text-purple-300/50">{doc._score.toFixed(3)}</span>
        )}
      </div>
      {doc.oneLiner && <p className="mt-0.5 text-[11px] text-purple-100/60">{doc.oneLiner}</p>}
      {doc.techStack && doc.techStack.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {doc.techStack.map((tech) => (
            <span key={tech} className="rounded bg-purple-500/10 px-1 py-0.5 text-[10px] text-purple-200/70">
              {tech}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-purple-300/40">ID: {doc.id}</p>
    </div>
  );
}

function renderResumeDoc(doc: RetrievedResumeDoc) {
  const label = doc.title || doc.company || doc.institution || doc.id;
  return (
    <div key={doc.id} className="rounded border border-purple-500/10 bg-purple-900/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-purple-100">{label}</span>
        {typeof doc._score === 'number' && (
          <span className="text-[10px] text-purple-300/50">{doc._score.toFixed(3)}</span>
        )}
      </div>
      {doc.type && <span className="text-[10px] text-purple-300/60">{capitalize(doc.type)}</span>}
      {doc.company && doc.title && <p className="text-[11px] text-purple-100/60">{doc.company}</p>}
      {doc.institution && <p className="text-[11px] text-purple-100/60">{doc.institution}</p>}
      {doc.summary && <p className="mt-0.5 text-[11px] text-purple-100/50 line-clamp-2">{doc.summary}</p>}
      <p className="mt-1 text-[10px] text-purple-300/40">ID: {doc.id}</p>
    </div>
  );
}

function CardReasoningDevSection({ cardReasoning }: { cardReasoning?: CardSelectionReasoning }) {
  if (!cardReasoning) return null;

  const categories = [
    { key: 'projects', label: 'Projects', data: cardReasoning.projects, hideExcluded: false },
    { key: 'experiences', label: 'Experiences', data: cardReasoning.experiences, hideExcluded: false },
    { key: 'education', label: 'Education', data: cardReasoning.education, hideExcluded: false },
    { key: 'links', label: 'Links', data: cardReasoning.links, hideExcluded: true },
  ].filter((c) => c.data && ((c.data.included?.length ?? 0) > 0 || (c.data.excluded?.length ?? 0) > 0));

  if (categories.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-purple-300/60">Card Selection</span>
      {categories.map(({ key, label, data, hideExcluded }) => (
        <CollapsibleCardReasoningDev
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

function CollapsibleCardReasoningDev({
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
    <div className="rounded border border-purple-500/10 bg-purple-950/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-medium text-purple-100/70 hover:bg-purple-500/5"
      >
        <span>
          {label} ({included.length} shown{!hideExcluded ? `, ${excluded.length} excluded` : ''})
        </span>
        <ChevronDown className={cn('h-3 w-3 text-purple-300/40 transition-transform', isOpen && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-purple-500/10 p-2">
              {included.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-green-400">Included</span>
                  {included.map((item) => (
                    <div key={item.id} className="rounded bg-green-500/10 p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-purple-100">{item.name}</span>
                        <span className="text-[10px] text-purple-300/40">{item.id}</span>
                      </div>
                      <p className="text-[11px] text-purple-100/60">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
              {showExcluded && (
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-red-400/80">Excluded</span>
                  {excluded.map((item) => (
                    <div key={item.id} className="rounded bg-red-500/10 p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-purple-100/60">{item.name}</span>
                        <span className="text-[10px] text-purple-300/40">{item.id}</span>
                      </div>
                      <p className="text-[11px] text-purple-100/50">{item.reason}</p>
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
