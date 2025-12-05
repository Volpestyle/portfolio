'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace, RetrievedProjectDoc, RetrievedResumeDoc } from '@portfolio/chat-contract';
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
  const hasData = Boolean(plan || retrievals.length || answer || traceError || debug);
  const isRetrievalStreaming = Boolean(isStreaming && plan && trace.retrieval === undefined);
  const isAnswerStreaming = Boolean(isStreaming && trace.retrieval !== undefined && !answer);

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
          {isStreaming && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />}
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

              <DevSection icon={<Brain className="h-4 w-4" />} title="Planner" isStreaming={isStreaming && !plan}>
                {plan ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {plan.model && <span className="text-purple-300/60">Model: <span className="text-purple-100">{plan.model}</span></span>}
                      {plan.topic && <span className="text-purple-300/60">Topic: <span className="text-purple-100">{plan.topic}</span></span>}
                    </div>
                    {plan.queries.length > 0 ? (
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
                    ) : (
                      <p className="text-xs text-purple-300/50">Skipped retrieval</p>
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
                ) : (
                  <p className="text-xs text-purple-300/40">Waiting...</p>
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
                ) : (
                  <p className="text-xs text-purple-300/40">Waiting...</p>
                )}
              </DevSection>

              <DevSection icon={<BookOpen className="h-4 w-4" />} title="Answer" isStreaming={isAnswerStreaming}>
                {answer ? (
                  <div className="space-y-2">
                    {answer.model && <p className="text-xs text-purple-300/60">Model: <span className="text-purple-100">{answer.model}</span></p>}
                    {answer.uiHints && (
                      <div className="flex gap-3 text-xs text-purple-300/60">
                        <span>Projects: <span className="text-purple-100">{answer.uiHints.projects?.length ?? 0}</span></span>
                        <span>Experiences: <span className="text-purple-100">{answer.uiHints.experiences?.length ?? 0}</span></span>
                        <span>Links: <span className="text-purple-100">{answer.uiHints.links?.length ?? 0}</span></span>
                      </div>
                    )}
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
                    <Collapsible label="Answer JSON">{JSON.stringify(answer, null, 2)}</Collapsible>
                    {debug?.answerPrompt && (
                      <div className="space-y-1.5">
                        <Collapsible label="System prompt">{debug.answerPrompt.system}</Collapsible>
                        <Collapsible label="User prompt">{debug.answerPrompt.user}</Collapsible>
                      </div>
                    )}
                    {debug?.answerRawResponse && <Collapsible label="Raw LLM response">{debug.answerRawResponse}</Collapsible>}
                  </div>
                ) : (
                  <p className="text-xs text-purple-300/40">Waiting...</p>
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

function capitalize(value: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function renderProjectDoc(doc: RetrievedProjectDoc, _idx: number) {
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

function renderResumeDoc(doc: RetrievedResumeDoc, _idx: number) {
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
