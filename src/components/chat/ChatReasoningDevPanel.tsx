'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { ChevronDown, Code, Database, Brain, FileSearch, Settings, Copy, Check } from 'lucide-react';

interface ChatReasoningDevPanelProps {
  trace: PartialReasoningTrace;
  isStreaming?: boolean;
  className?: string;
}

export function ChatReasoningDevPanel({ trace, isStreaming = false, className }: ChatReasoningDevPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    plan: true,
    retrieval: true,
    evidence: true,
    answer: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (!trace.plan) {
    return null;
  }

  const plan = trace.plan;
  const retrievals = trace.retrieval ?? [];
  const evidence = trace.evidence ?? null;
  const answerMeta = trace.answerMeta ?? null;
  const planFocus = inferPlanFocus(plan);
  const isMetaTurn = plan.questionType === 'meta';
  const retrievalExpected = !isMetaTurn && (plan.retrievalRequests?.length ?? 0) > 0;

  return (
    <div className={cn('w-full rounded-lg border border-purple-500/30 bg-purple-950/20 backdrop-blur-sm', className)}>
      {/* Header */}
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

      {/* Expandable Content */}
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
              {/* Planner Output */}
              <DevSection
                icon={<Brain className="h-4 w-4" />}
                title="Planner Output"
                sectionKey="plan"
              isExpanded={expandedSections.plan}
              onToggle={() => toggleSection('plan')}
            >
              <div className="space-y-3">
                <KeyValue label="questionType" value={plan.questionType} />
                <KeyValue label="enumeration" value={plan.enumeration} />
                <KeyValue label="scope" value={plan.scope} />
                {planFocus && <KeyValue label="retrievalFocus" value={planFocus} />}
                {plan.cardsEnabled === false && <KeyValue label="cardsEnabled" value="false" />}
                {plan.topic && <KeyValue label="topic" value={plan.topic} />}
                {plan.resumeFacets && plan.resumeFacets.length > 0 && (
                  <KeyValue label="resumeFacets" value={plan.resumeFacets} />
                )}
                  {plan.retrievalRequests.length > 0 && (
                    <div className="mt-2">
                      <p className="mb-2 text-xs font-medium text-purple-300">retrievalRequests:</p>
                      <div className="space-y-2">
                        {plan.retrievalRequests.map((req, idx) => (
                          <div key={idx} className="rounded border border-purple-500/20 bg-purple-950/30 p-2 text-xs">
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-purple-400">source:</span>
                                <span className="text-purple-200">{req.source}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-purple-400">topK:</span>
                                <span className="text-purple-200">{req.topK}</span>
                              </div>
                              <div className="mt-1">
                                <span className="text-purple-400">queryText:</span>
                                <p className="mt-1 text-purple-200">{req.queryText}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <JsonCollapsible data={plan} label="Full JSON" />
              </DevSection>

              {/* Retrieval Results */}
              <DevSection
                icon={<Database className="h-4 w-4" />}
                title="Retrieval Results"
                sectionKey="retrieval"
                isExpanded={expandedSections.retrieval}
                onToggle={() => toggleSection('retrieval')}
              >
                {trace.retrieval === null ? (
                  <DevPlaceholder>{retrievalExpected ? 'Retrieval stage pending…' : 'Skipped (no retrieval needed)'}</DevPlaceholder>
                ) : retrievals.length === 0 ? (
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

              {/* Evidence Summary */}
              <DevSection
                icon={<FileSearch className="h-4 w-4" />}
                title="Evidence Summary"
                sectionKey="evidence"
                isExpanded={expandedSections.evidence}
                onToggle={() => toggleSection('evidence')}
              >
                {evidence ? (
                  <>
                    <div className="space-y-3">
                      <KeyValue label="verdict" value={evidence.verdict} />
                      <KeyValue label="confidence" value={evidence.confidence} />
                      <div>
                        <p className="mb-1 text-xs font-medium text-purple-300">reasoning:</p>
                        <p className="text-xs leading-relaxed text-purple-200">{evidence.reasoning}</p>
                      </div>
                      {evidence.selectedEvidence.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-purple-300">
                            selectedEvidence ({evidence.selectedEvidence.length}):
                          </p>
                          <div className="space-y-2">
                            {evidence.selectedEvidence.map((item, idx) => (
                              <div key={idx} className="rounded border border-purple-500/20 bg-purple-950/30 p-2 text-xs">
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-purple-400">source:</span>
                                    <span className="text-purple-200">{item.source}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-purple-400">relevance:</span>
                                    <span className="text-purple-200">{item.relevance}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-purple-400">id:</span>
                                    <span className="font-mono text-purple-200">{item.id}</span>
                                  </div>
                                  <div>
                                    <span className="text-purple-400">title:</span>
                                    <p className="mt-1 text-purple-200">{item.title}</p>
                                  </div>
                                  <div>
                                    <span className="text-purple-400">snippet:</span>
                                    <p className="mt-1 text-purple-200">{item.snippet}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {evidence.semanticFlags.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-purple-300">semanticFlags:</p>
                          <div className="space-y-2">
                            {evidence.semanticFlags.map((flag, idx) => (
                              <div key={idx} className="rounded border border-yellow-500/30 bg-yellow-950/30 p-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-yellow-400">type:</span>
                                  <span className="text-yellow-200">{flag.type}</span>
                                </div>
                                <div className="mt-1">
                                  <span className="text-yellow-400">reason:</span>
                                  <p className="mt-1 text-yellow-200">{flag.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <JsonCollapsible data={evidence} label="Full JSON" />
                  </>
                ) : (
                  <DevPlaceholder>Evidence stage pending…</DevPlaceholder>
                )}
              </DevSection>

              {/* Answer Metadata */}
              <DevSection
                icon={<Settings className="h-4 w-4" />}
                title="Answer Metadata"
                sectionKey="answer"
                isExpanded={expandedSections.answer}
                onToggle={() => toggleSection('answer')}
              >
                {answerMeta ? (
                  <>
                    <div className="space-y-3">
                      <KeyValue label="model" value={answerMeta.model} />
                      <KeyValue label="questionType" value={answerMeta.questionType} />
                      <KeyValue label="enumeration" value={answerMeta.enumeration} />
                      <KeyValue label="scope" value={answerMeta.scope} />
                      <KeyValue label="verdict" value={answerMeta.verdict} />
                      <KeyValue label="confidence" value={answerMeta.confidence} />
                      {answerMeta.thoughts && answerMeta.thoughts.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-purple-300">
                            thoughts ({answerMeta.thoughts.length}):
                          </p>
                          <ol className="space-y-2">
                            {answerMeta.thoughts.map((thought, idx) => (
                              <li key={idx} className="flex gap-2 text-xs">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-500/20 font-mono text-purple-300">
                                  {idx + 1}
                                </span>
                                <span className="flex-1 leading-relaxed text-purple-200">{thought}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                    <JsonCollapsible data={answerMeta} label="Full JSON" />
                  </>
                ) : (
                  <DevPlaceholder>Answer stage pending…</DevPlaceholder>
                )}
              </DevSection>

              {/* Full Trace JSON */}
              <div className="pt-2">
                <JsonCollapsible data={trace} label="Complete Reasoning Trace (JSON)" defaultExpanded={false} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DevSectionProps {
  icon: React.ReactNode;
  title: string;
  sectionKey: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function DevSection({ icon, title, isExpanded, onToggle, children }: DevSectionProps) {
  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-950/20">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-purple-500/10"
      >
        <div className="flex items-center gap-2">
          <div className="text-purple-400">{icon}</div>
          <h4 className="text-xs font-semibold text-purple-200">{title}</h4>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-3.5 w-3.5 text-purple-300" />
        </motion.div>
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
            <div className="border-t border-purple-500/20 px-3 py-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function inferPlanFocus(plan?: PartialReasoningTrace['plan'] | null): 'resume' | 'projects' | 'mixed' | null {
  if (!plan) return null;
  const sources = new Set(plan.retrievalRequests?.map((req) => req.source));
  const hasResume = sources.has('resume');
  const hasProjects = sources.has('projects');
  if (hasResume && hasProjects) return 'mixed';
  if (hasResume) return 'resume';
  if (hasProjects) return 'projects';
  if (plan.scope === 'employment_only' || (plan.resumeFacets ?? []).includes('experience')) return 'resume';
  return 'mixed';
}

function DevPlaceholder({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-purple-200/70">{children}</p>;
}

interface KeyValueProps {
  label: string;
  value: string | number | boolean | string[] | null | undefined;
}

function KeyValue({ label, value }: KeyValueProps) {
  const displayValue = Array.isArray(value) ? `[${value.join(', ')}]` : String(value);

  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="font-mono text-purple-400">{label}:</span>
      <span className="text-right font-mono text-purple-200">{displayValue}</span>
    </div>
  );
}

interface JsonCollapsibleProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
}

function JsonCollapsible({ data, label = 'View JSON', defaultExpanded = false }: JsonCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded border border-purple-500/20 bg-purple-950/40">
      <div className="flex items-center justify-between border-b border-purple-500/20 px-2 py-1.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-purple-200"
        >
          <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3 w-3" />
          </motion.div>
          {label}
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
          title="Copy JSON"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <pre className="max-h-96 overflow-auto p-2 text-[10px] leading-relaxed text-purple-200">
              <code>{jsonString}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
