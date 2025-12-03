'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PartialReasoningTrace, EvidenceItem, ReasoningTraceError } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronDown, Search, FileText, MessageSquare, Brain, Gauge } from 'lucide-react';

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
  const evidence = trace.evidence ?? null;
  const answerMeta = trace.answerMeta ?? null;
  const traceError = trace.error ?? null;
  const hasEvidenceItems = Boolean(evidence && evidence.selectedEvidence.length > 0);
  const isMetaTurn = plan?.questionType === 'meta' || answerMeta?.questionType === 'meta';
  const retrievalFocus = plan ? inferPlanFocus(plan) : null;
  const failureStage = traceError ? traceError.stage ?? inferFailedStage(trace, isMetaTurn) : null;
  const hasError = Boolean(traceError);
  const streamingStage = isStreaming ? inferStreamingStage(trace) : null;
  const streamingTitle = streamingStage ? formatStreamingStageLabel(streamingStage) : 'Thinking...';

  if (isMetaTurn) {
    return null;
  }

  // Format duration
  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Dynamic title: "Thinking..." while streaming, "Thought for Xs" when done
  const title = traceError
    ? durationMs
      ? `Stopped after ${formatDuration(durationMs)}`
      : 'Reasoning failed'
    : isStreaming
      ? streamingTitle
      : durationMs
        ? `Thought for ${formatDuration(durationMs)}`
        : 'How I answered';

  return (
    <div className={cn('w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm', className)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          {/* Only show icon when done reasoning */}
          <AnimatePresence mode="wait">
            {hasError ? (
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
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-400/80" />
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
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-white/60" />
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
            <div className="space-y-4 border-t border-white/10 px-4 py-3">
              {hasError && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {failureStage ? `Stopped during ${formatStageLabel(failureStage)}.` : 'Reasoning was interrupted.'}
                    </p>
                    <p className="text-red-100/80">{traceError?.message}</p>
                    {traceError?.retryable === false && (
                      <p className="text-red-100/70">Please try a different phrasing or question.</p>
                    )}
                    {traceError?.code && <p className="text-[11px] text-red-100/70">Code: {traceError.code}</p>}
                  </div>
                </div>
              )}

              {/* Question Classification - Always show */}
              <ReasoningSection
                icon={<MessageSquare className="h-4 w-4" />}
                title="Question Classification"
                isStreaming={isStreaming && !plan}
              >
                {plan ? (
                  <div className="space-y-2">
                    <InfoRow label="Question Type" value={formatQuestionType(plan.questionType)} />
                    {retrievalFocus && <InfoRow label="Focus" value={formatFocus(retrievalFocus)} />}
                    <InfoRow
                      label="Enumeration"
                      value={plan.enumeration === 'all_relevant' ? 'All relevant items' : 'Sample / examples'}
                    />
                    {plan.scope && <InfoRow label="Scope" value={formatExperienceScope(plan.scope)} />}
                    {plan.cardsEnabled === false && <InfoRow label="Cards" value="Disabled (text-only)" />}
                  </div>
                ) : hasError ? (
                  <ErrorState status="Planning failed before completing." />
                ) : (
                  <LoadingState status="Analyzing your question..." />
                )}
              </ReasoningSection>

              {/* What I Searched - Show when retrieval is ready OR show loading if plan is ready */}
              {retrievals && retrievals.length > 0 ? (
                <ReasoningSection icon={<Search className="h-4 w-4" />} title="What I Searched" isStreaming={false}>
                  <div className="space-y-2">
                    {retrievals.map((r, idx) => (
                      <div key={idx} className="rounded-md border border-white/5 bg-white/5 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-300">{formatSource(r.source)}</span>
                          <span className="text-xs text-white/40">
                            {r.numResults} result{r.numResults !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-white/70">{r.queryText}</p>
                      </div>
                    ))}
                  </div>
                </ReasoningSection>
              ) : plan ? (
                <ReasoningSection
                  icon={<Search className="h-4 w-4" />}
                  title="What I Searched"
                  isStreaming={!hasError}
                >
                  {hasError ? (
                    <ErrorState
                      status={
                        failureStage === 'retrieval'
                          ? 'Retrieval failed before completing.'
                          : 'Retrieval did not finish.'
                      }
                    />
                  ) : (
                    <LoadingState status="Searching portfolio..." />
                  )}
                </ReasoningSection>
              ) : null}

              {/* Evidence I Used - Show when evidence is ready OR show loading if retrieval is ready */}
              {evidence ? (
                <ReasoningSection icon={<FileText className="h-4 w-4" />} title="Evidence I Used" isStreaming={false}>
                  <div className="space-y-2">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs text-white/60">Decision:</span>
                      <span className={cn('text-xs font-medium', getVerdictColor(evidence.verdict))}>
                        {formatVerdict(evidence.verdict)}
                      </span>
                      <span className="text-xs text-white/40">•</span>
                      <ConfidenceBadge level={evidence.confidence} />
                    </div>
                    {evidence.uiHints && (
                      <div className="flex gap-3 text-[11px] text-white/50">
                        <span>
                          UI hints: {evidence.uiHints.projects?.length ?? 0} project
                          {(evidence.uiHints.projects?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                        <span>
                          {evidence.uiHints.experiences?.length ?? 0} experience
                          {(evidence.uiHints.experiences?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                    {hasEvidenceItems ? (
                      evidence.selectedEvidence.map((item, idx) => (
                        <EvidenceCard key={`${item.id}-${idx}`} item={item} />
                      ))
                    ) : (
                      <p className="text-xs text-white/60">
                        No portfolio evidence was needed or available for this question.
                      </p>
                    )}
                  </div>
                </ReasoningSection>
              ) : retrievals && retrievals.length > 0 ? (
                <ReasoningSection
                  icon={<FileText className="h-4 w-4" />}
                  title="Evidence I Used"
                  isStreaming={!hasError}
                >
                  {hasError ? (
                    <ErrorState status="Evidence step did not complete." />
                  ) : (
                    <LoadingState status="Evaluating evidence..." />
                  )}
                </ReasoningSection>
              ) : null}

              {/* How I Interpreted It - Show when answer is ready OR show loading if evidence is ready */}
              {evidence?.reasoning || (answerMeta?.thoughts && answerMeta.thoughts.length > 0) ? (
                <ReasoningSection icon={<Gauge className="h-4 w-4" />} title="How I Interpreted It" isStreaming={false}>
                  <div className="space-y-3">
                    {evidence?.reasoning && (
                      <div className="text-xs leading-relaxed text-white/70">{evidence.reasoning}</div>
                    )}
                    {answerMeta?.thoughts && answerMeta.thoughts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-white/60">Reasoning steps:</p>
                        <ol className="space-y-1.5">
                          {answerMeta.thoughts.map((thought, idx) => (
                            <li key={idx} className="flex gap-2 text-xs text-white/70">
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-medium text-blue-300">
                                {idx + 1}
                              </span>
                              <span className="flex-1">{thought}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </ReasoningSection>
              ) : evidence ? (
                <ReasoningSection
                  icon={<Gauge className="h-4 w-4" />}
                  title="How I Interpreted It"
                  isStreaming={!hasError}
                >
                  {hasError ? (
                    <ErrorState status="Answer generation did not finish." />
                  ) : (
                    <LoadingState status="Crafting answer..." />
                  )}
                </ReasoningSection>
              ) : null}

              {/* Semantic Flags */}
              {evidence && (evidence.semanticFlags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(evidence.semanticFlags ?? []).map((flag, idx) => (
                    <div
                      key={idx}
                      className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-300"
                      title={flag.reason}
                    >
                      {formatSemanticFlag(flag.type)}
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

interface ReasoningSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  isStreaming?: boolean;
}

function ReasoningSection({ icon, title, children, isStreaming }: ReasoningSectionProps) {
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

function ErrorState({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-red-300" />
      <span className="text-xs text-red-100/90">{status}</span>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  badge?: 'high' | 'medium' | 'low';
}

function InfoRow({ label, value, badge }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-white/80">{value}</span>
        {badge && <ConfidenceBadge level={badge} />}
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-green-500/20 text-green-300 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    low: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  return (
    <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-medium', colors[level])}>{level}</span>
  );
}

interface EvidenceCardProps {
  item: EvidenceItem;
}

function EvidenceCard({ item }: EvidenceCardProps) {
  return (
    <div className="rounded-md border border-white/5 bg-white/5 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/90">{item.title}</span>
            <span className="text-[10px] text-white/40">{formatSource(item.source)}</span>
          </div>
          <p className="text-xs leading-relaxed text-white/60">{item.snippet}</p>
        </div>
        <RelevanceBadge relevance={item.relevance} />
      </div>
    </div>
  );
}

function RelevanceBadge({ relevance }: { relevance: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    medium: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    low: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  };

  return (
    <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', colors[relevance])}>
      {relevance}
    </span>
  );
}

// Formatting utilities
function inferFailedStage(trace: PartialReasoningTrace, isMetaTurn: boolean): ReasoningTraceError['stage'] {
  if (trace.answerMeta) return 'answer';
  if (trace.evidence) return 'answer';
  if (!isMetaTurn && trace.retrieval) return 'evidence';
  if (trace.plan) return isMetaTurn ? 'answer' : 'retrieval';
  return 'plan';
}

function formatStageLabel(stage?: ReasoningTraceError['stage']): string {
  switch (stage) {
    case 'plan':
      return 'planning';
    case 'retrieval':
      return 'retrieval';
    case 'evidence':
      return 'evidence review';
    case 'answer':
      return 'answer drafting';
    default:
      return 'the conversation';
  }
}

type PlanFocus = 'resume' | 'projects' | 'mixed';

function inferPlanFocus(plan?: PartialReasoningTrace['plan'] | null): PlanFocus | null {
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

function formatFocus(focus: PlanFocus): string {
  if (focus === 'mixed') return 'Mixed sources';
  return focus === 'resume' ? 'Resume-first' : 'Projects-first';
}

function formatQuestionType(questionType: string): string {
  return questionType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatExperienceScope(scope: string): string {
  return scope === 'employment_only' ? 'Employment Only' : 'Any Experience';
}

function formatSource(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatVerdict(verdict: string): string {
  return verdict.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatSemanticFlag(flag: string): string {
  return flag.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'yes':
      return 'text-green-300';
    case 'no':
      return 'text-red-300';
    case 'partial':
      return 'text-yellow-300';
    case 'n/a':
      return 'text-white/60';
    default:
      return 'text-white/50';
  }
}

type StreamingStage = 'planning' | 'searching' | 'evidence' | 'drafting';

function inferStreamingStage(trace: PartialReasoningTrace): StreamingStage | null {
  if (!trace?.plan) {
    return 'planning';
  }
  if (!trace.retrieval) {
    return 'searching';
  }
  if (!trace.evidence) {
    return 'evidence';
  }
  if (!trace.answerMeta) {
    return 'drafting';
  }
  return null;
}

function formatStreamingStageLabel(stage: StreamingStage): string {
  switch (stage) {
    case 'planning':
      return 'Planning...';
    case 'searching':
      return 'Searching...';
    case 'evidence':
      return 'Evaluating evidence...';
    case 'drafting':
      return 'Drafting answer...';
    default:
      return 'Thinking...';
  }
}
