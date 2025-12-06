import type { PartialReasoningTrace, ReasoningStage, ReasoningTraceError } from '@portfolio/chat-contract';

export function buildPartialReasoningTrace(seed?: Partial<PartialReasoningTrace>): PartialReasoningTrace {
  return {
    plan: seed?.plan ?? null,
    retrieval: seed?.retrieval ?? null,
    retrievalDocs: seed?.retrievalDocs ?? null,
    answer: seed?.answer ?? null,
    error: seed?.error ?? null,
    debug: seed?.debug ?? null,
    streaming: seed?.streaming,
  };
}

export function mergeReasoningTraces(
  existing: PartialReasoningTrace | undefined,
  incoming: PartialReasoningTrace
): PartialReasoningTrace {
  const merged: PartialReasoningTrace = {
    plan: incoming.plan ?? existing?.plan ?? null,
    retrieval: incoming.retrieval ?? existing?.retrieval ?? null,
    retrievalDocs: incoming.retrievalDocs ?? existing?.retrievalDocs ?? null,
    answer: incoming.answer ?? existing?.answer ?? null,
    error: mergeReasoningErrors(existing?.error, incoming.error, {
      plan: incoming.plan ?? existing?.plan ?? null,
      retrieval: incoming.retrieval ?? existing?.retrieval ?? null,
      answer: incoming.answer ?? existing?.answer ?? null,
    }),
    debug: mergeReasoningDebug(existing?.debug, incoming.debug),
    streaming: mergeStreaming(existing?.streaming, incoming.streaming),
  };

  if (existing && reasoningTracesEqual(existing, merged)) {
    return existing;
  }
  return merged;
}

export function reasoningTracesEqual(a: PartialReasoningTrace, b: PartialReasoningTrace): boolean {
  return (
    a.plan === b.plan &&
    a.retrieval === b.retrieval &&
    a.retrievalDocs === b.retrievalDocs &&
    a.answer === b.answer &&
    a.error === b.error &&
    debugEqual(a.debug, b.debug) &&
    streamingEqual(a.streaming, b.streaming)
  );
}

export function mergeReasoningDebug(
  existing: PartialReasoningTrace['debug'],
  incoming: PartialReasoningTrace['debug']
): PartialReasoningTrace['debug'] {
  if (!existing && !incoming) return undefined;
  if (!incoming) return existing;
  const base = existing ?? {};
  return {
    ...base,
    ...incoming,
    plannerPrompt: incoming.plannerPrompt ?? base.plannerPrompt,
    answerPrompt: incoming.answerPrompt ?? base.answerPrompt,
    plannerRawResponse: incoming.plannerRawResponse ?? base.plannerRawResponse,
    answerRawResponse: incoming.answerRawResponse ?? base.answerRawResponse,
    retrievalDocs: incoming.retrievalDocs ?? base.retrievalDocs,
  };
}

function debugEqual(a: PartialReasoningTrace['debug'], b: PartialReasoningTrace['debug']): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.plannerPrompt?.system === b.plannerPrompt?.system &&
    a.plannerPrompt?.user === b.plannerPrompt?.user &&
    a.answerPrompt?.system === b.answerPrompt?.system &&
    a.answerPrompt?.user === b.answerPrompt?.user &&
    a.plannerRawResponse === b.plannerRawResponse &&
    a.answerRawResponse === b.answerRawResponse &&
    JSON.stringify(a.retrievalDocs) === JSON.stringify(b.retrievalDocs)
  );
}

export function mergeStreaming(
  existing: PartialReasoningTrace['streaming'],
  incoming: PartialReasoningTrace['streaming']
): PartialReasoningTrace['streaming'] {
  if (!existing && !incoming) return undefined;
  if (!incoming) return existing;
  const merged: NonNullable<PartialReasoningTrace['streaming']> = { ...(existing ?? {}) };
  for (const [stage, chunk] of Object.entries(incoming)) {
    if (!chunk || typeof chunk !== 'object') continue;
    const key = stage as ReasoningStage;
    const current = merged[key] ?? {};
    const combinedText = [current.text ?? '', (chunk as { text?: string }).text ?? ''].join('');
    merged[key] = {
      text: combinedText.length ? combinedText : undefined,
      notes: (chunk as { notes?: string }).notes ?? current.notes,
      progress: (chunk as { progress?: number }).progress ?? current.progress,
    };
  }
  return merged;
}

function streamingEqual(
  a: PartialReasoningTrace['streaming'],
  b: PartialReasoningTrace['streaming']
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const stages = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const stage of stages) {
    const left = (a as NonNullable<typeof a>)[stage as keyof NonNullable<typeof a>];
    const right = (b as NonNullable<typeof b>)[stage as keyof NonNullable<typeof b>];
    if (!left && !right) continue;
    if (!left || !right) return false;
    if (left.text !== right.text || left.notes !== right.notes || left.progress !== right.progress) {
      return false;
    }
  }
  return true;
}

export function mergeReasoningErrors(
  existing: PartialReasoningTrace['error'],
  incoming: PartialReasoningTrace['error'],
  mergedStages: Pick<PartialReasoningTrace, 'plan' | 'retrieval' | 'answer'>
): ReasoningTraceError | null {
  const candidate = incoming ?? existing ?? null;
  if (!candidate) {
    return null;
  }

  const stage = candidate.stage && candidate.stage.length ? candidate.stage : inferErroredStage(mergedStages);
  if (!incoming && existing && existing.stage === stage) {
    return existing;
  }

  return {
    ...candidate,
    stage,
  };
}

export function inferErroredStage(
  trace: Pick<PartialReasoningTrace, 'plan' | 'retrieval' | 'answer'>
): ReasoningTraceError['stage'] {
  if (trace.answer) return 'answer';
  if (trace.retrieval) return 'retrieval';
  if (trace.plan) return 'planner';
  return 'planner';
}
