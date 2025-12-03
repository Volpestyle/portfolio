import { randomUUID } from 'crypto';
import { SSE_HEADERS } from '@portfolio/chat-next-api';
import { TEST_PROJECT_DETAIL } from '../fixtures';

const encoder = new TextEncoder();

function createAnchorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return randomUUID();
}

export function buildChatFixtureResponse({
  answerModel,
  headers = {},
}: {
  answerModel: string;
  headers?: HeadersInit;
}): Response {
  const anchorId = createAnchorId();
  const project = TEST_PROJECT_DETAIL;
  const projectId = project.slug ?? project.name;
  const reasoningTrace = {
    plan: {
      questionType: 'narrative',
      enumeration: 'sample',
      scope: 'any_experience',
      topic: 'featured project',
      retrievalRequests: [
        { source: 'projects', topK: 5, queryText: 'featured project highlights' },
        { source: 'resume', topK: 4, queryText: 'supporting resume context' },
      ],
      resumeFacets: [],
      cardsEnabled: true,
    },
    retrieval: [
      { source: 'projects', queryText: 'featured project highlights', requestedTopK: 5, effectiveTopK: 5, numResults: 3 },
      { source: 'resume', queryText: 'supporting resume context', requestedTopK: 4, effectiveTopK: 4, numResults: 2 },
    ],
    evidence: {
      verdict: 'yes',
      confidence: 'high',
      reasoning: 'Highlighted the featured project and related resume examples to explain the impact.',
      selectedEvidence: [
        { source: 'project', id: projectId, title: project.name, snippet: project.oneLiner, relevance: 'high' },
      ],
      semanticFlags: [],
      uiHints: { projects: [projectId], experiences: [] },
    },
    answerMeta: {
      model: answerModel,
      questionType: 'narrative',
      enumeration: 'sample',
      scope: 'any_experience',
      verdict: 'yes',
      confidence: 'high',
      thoughts: ['Introduce the project and why it stands out', 'Invite the user to explore the card for more context'],
    },
  };
  const retrievalCounts = reasoningTrace.retrieval.reduce(
    (acc, { source, numResults }) => {
      acc.totalDocs += numResults;
      if (!acc.sources.includes(source)) acc.sources.push(source);
      return acc;
    },
    { totalDocs: 0, sources: [] as string[] },
  );
  const evidenceCount = reasoningTrace.evidence.selectedEvidence.length;
  const frames = [
    { type: 'item', itemId: anchorId, anchorId, kind: 'answer' },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'planner', status: 'start' },
    {
      type: 'stage',
      itemId: anchorId,
      anchorId,
      stage: 'planner',
      status: 'complete',
      meta: {
        questionType: reasoningTrace.plan.questionType,
        enumeration: reasoningTrace.plan.enumeration,
        scope: reasoningTrace.plan.scope,
        topic: reasoningTrace.plan.topic,
      },
      durationMs: 220,
    },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'retrieval', status: 'start' },
    {
      type: 'stage',
      itemId: anchorId,
      anchorId,
      stage: 'retrieval',
      status: 'complete',
      meta: { docsFound: retrievalCounts.totalDocs, sources: retrievalCounts.sources },
      durationMs: 140,
    },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'evidence', status: 'start' },
    {
      type: 'stage',
      itemId: anchorId,
      anchorId,
      stage: 'evidence',
      status: 'complete',
      meta: { verdict: reasoningTrace.evidence.verdict, confidence: reasoningTrace.evidence.confidence, evidenceCount },
      durationMs: 260,
    },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'answer', status: 'start' },
    {
      type: 'token',
      delta: "Here's a featured project from my portfolio.",
      itemId: anchorId,
    },
    {
      type: 'ui',
      itemId: anchorId,
      ui: { showProjects: [projectId], showExperiences: [] },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'plan',
      trace: { plan: reasoningTrace.plan, retrieval: null, evidence: null, answerMeta: null },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'retrieval',
      trace: { plan: null, retrieval: reasoningTrace.retrieval, evidence: null, answerMeta: null },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'evidence',
      trace: { plan: null, retrieval: null, evidence: reasoningTrace.evidence, answerMeta: null },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'answer',
      trace: { plan: null, retrieval: null, evidence: null, answerMeta: reasoningTrace.answerMeta },
    },
    { type: 'ui_actions', itemId: anchorId, actions: [] },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'answer', status: 'complete', durationMs: 800 },
    { type: 'done' },
  ];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { ...SSE_HEADERS, ...headers } });
}
