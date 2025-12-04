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
      topic: 'featured project',
      queries: [
        { source: 'projects', limit: 5, text: 'featured project highlights' },
        { source: 'resume', limit: 4, text: 'supporting resume context' },
      ],
      cardsEnabled: true,
    },
    retrieval: [
      {
        source: 'projects',
        queryText: 'featured project highlights',
        requestedTopK: 5,
        effectiveTopK: 5,
        numResults: 3,
      },
      { source: 'resume', queryText: 'supporting resume context', requestedTopK: 4, effectiveTopK: 4, numResults: 2 },
    ],
    answer: {
      model: answerModel,
      uiHints: { projects: [projectId], experiences: [] },
      thoughts: ['Introduce the project and why it stands out', 'Invite the user to explore the card for more context'],
      message: "Here's a featured project from my portfolio.",
    },
  };
  const retrievalCounts = reasoningTrace.retrieval.reduce(
    (acc, { source, numResults }) => {
      acc.totalDocs += numResults;
      if (!acc.sources.includes(source)) acc.sources.push(source);
      return acc;
    },
    { totalDocs: 0, sources: [] as string[] }
  );
  const frames = [
    { type: 'item', itemId: anchorId, anchorId, kind: 'answer' },
    { type: 'stage', itemId: anchorId, anchorId, stage: 'planner', status: 'start' },
    {
      type: 'stage',
      itemId: anchorId,
      anchorId,
      stage: 'planner',
      status: 'complete',
      meta: { topic: reasoningTrace.plan.topic, cardsEnabled: true },
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
      stage: 'planner',
      trace: { plan: reasoningTrace.plan, retrieval: null, answer: null },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'retrieval',
      trace: { plan: null, retrieval: reasoningTrace.retrieval, answer: null },
    },
    {
      type: 'reasoning',
      itemId: anchorId,
      stage: 'answer',
      trace: { plan: null, retrieval: null, answer: reasoningTrace.answer },
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
