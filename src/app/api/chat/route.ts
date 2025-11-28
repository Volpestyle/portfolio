import { NextRequest } from 'next/server';
import { createChatSseStream, SSE_HEADERS } from '@portfolio/chat-next-api';
import { shouldReturnTestFixtures } from '@/lib/test-mode';
import { TEST_PROJECT_DETAIL } from '@/lib/test-fixtures';
import { logChatDebug, resetChatDebugLogs, runWithChatLogContext } from '@portfolio/chat-next-api';
import { buildRateLimitHeaders, enforceChatRateLimit } from '@/lib/rate-limit';
import { getOpenAIClient } from '@/server/openai/client';
import { chatApi, chatLogger, chatOwnerId, chatRuntimeOptions } from '@/server/chat/pipeline';
import { moderateChatMessages } from '@/server/chat/moderation';
import { randomUUID } from 'crypto';
import type { ChatPostBody } from '@/server/chat/requestValidation';
import { resolveReasoningEnabled, validateChatPostBody } from '@/server/chat/requestValidation';
import {
  getRuntimeCostClients,
  recordRuntimeCost,
  shouldThrottleForBudget,
} from '@/server/chat/runtimeCost';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Model comes from chat.config.yml per spec - no hardcoded fallback
const fixtureAnswerModel = chatRuntimeOptions?.modelConfig?.answerModel;
if (!fixtureAnswerModel) {
  throw new Error('Missing modelConfig.answerModel in chat.config.yml');
}

const MODERATION_REFUSAL_MESSAGE =
  'I can only answer questions about my portfolio and professional background.';
const MODERATION_REFUSAL_BANNER = 'That request was blocked by my safety filters.';
const OUTPUT_MODERATION_ENABLED = process.env.CHAT_OUTPUT_MODERATION_ENABLED === 'true';
const OUTPUT_MODERATION_MODEL = process.env.CHAT_OUTPUT_MODERATION_MODEL;
const BUDGET_EXCEEDED_MESSAGE = 'Experiencing technical issues, try again later.';

function createAnchorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return randomUUID();
}

function buildFixtureResponse(headers: HeadersInit = {}): Response {
  const encoder = new TextEncoder();
  const anchorId = createAnchorId();
  const project = TEST_PROJECT_DETAIL;
  const projectId = project.slug ?? project.name;
  const reasoningTrace = {
    plan: {
      intent: 'describe',
      topic: 'featured project',
      plannerConfidence: 0.86,
      isFollowup: false,
      experienceScope: null,
      retrievalRequests: [
        { source: 'projects', topK: 5, queryText: 'featured project highlights' },
        { source: 'resume', topK: 4, queryText: 'supporting resume context' },
      ],
      resumeFacets: [],
      answerMode: 'narrative_with_examples',
      answerLengthHint: 'medium',
      enumerateAllRelevant: false,
      debugNotes: null,
    },
    retrieval: [
      { source: 'projects', queryText: 'featured project highlights', requestedTopK: 5, effectiveTopK: 5, numResults: 3 },
      { source: 'resume', queryText: 'supporting resume context', requestedTopK: 4, effectiveTopK: 4, numResults: 2 },
    ],
    evidence: {
      highLevelAnswer: 'yes',
      evidenceCompleteness: 'strong',
      reasoning: 'Highlighted the featured project and related resume examples to explain the impact.',
      selectedEvidence: [
        { source: 'project', id: projectId, title: project.name, snippet: project.oneLiner, relevance: 'high' },
      ],
      semanticFlags: [],
      uiHints: { projects: [projectId], experiences: [] },
    },
    answerMeta: {
      model: fixtureAnswerModel,
      answerMode: 'narrative_with_examples',
      answerLengthHint: 'medium',
      thoughts: ['Introduce the project and why it stands out', 'Invite the user to explore the card for more context'],
    },
    uiHintWarnings: [],
  };
  const retrievalCounts = reasoningTrace.retrieval.reduce(
    (acc, { source, numResults }) => {
      acc.totalDocs += numResults;
      if (!acc.sources.includes(source)) acc.sources.push(source);
      return acc;
    },
    { totalDocs: 0, sources: [] as string[] },
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
      meta: { intent: reasoningTrace.plan.intent, topic: reasoningTrace.plan.topic },
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
      meta: { highLevelAnswer: reasoningTrace.evidence.highLevelAnswer, evidenceCount: 1 },
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

function buildErrorSseResponse({
  code,
  message,
  retryable,
  retryAfterMs,
  headers,
  status,
  anchorId,
}: {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  headers?: HeadersInit;
  status?: number;
  anchorId?: string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            anchorId,
            itemId: anchorId,
            code,
            message,
            retryable,
            retryAfterMs,
          })}\n\n`
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status: status ?? (retryable ? 429 : 503),
    headers: { ...SSE_HEADERS, ...(headers ?? {}) },
  });
}

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  const body = ((await request.json()) as ChatPostBody) ?? {};
  const validation = validateChatPostBody(body, chatOwnerId);
  if (!validation.ok) {
    return new Response(validation.error, { status: validation.status });
  }
  const {
    messages,
    responseAnchorId,
    ownerId,
    reasoningEnabled: requestedReasoningEnabled,
    conversationId,
  } = validation.value;

  return runWithChatLogContext({ correlationId, conversationId }, async () => {
    const reasoningEnabled = resolveReasoningEnabled({
      requested: requestedReasoningEnabled,
      environment: process.env.NODE_ENV,
    });

    if (process.env.NODE_ENV !== 'production' && messages.length === 1) {
      resetChatDebugLogs();
    }

    const rateLimit = await enforceChatRateLimit(request);
    const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
    if (!rateLimit.success) {
      const status = rateLimit.reason === 'Rate limiter unavailable'
        ? 503
        : rateLimit.reason === 'Unable to identify client IP'
          ? 400
          : 429;
      const retryAfterMs =
        typeof rateLimit.reset === 'number' && Number.isFinite(rateLimit.reset)
          ? Math.max(0, rateLimit.reset * 1000 - Date.now())
          : undefined;
      return buildErrorSseResponse({
        code: 'rate_limited',
        message: rateLimit.reason ?? 'Rate limit exceeded',
        retryable: true,
        retryAfterMs,
        headers: rateLimitHeaders,
        status,
        anchorId: responseAnchorId,
      });
    }

    const runtimeCostClients = await getRuntimeCostClients(ownerId);
    if (runtimeCostClients) {
      try {
        const costState = await shouldThrottleForBudget(runtimeCostClients, chatLogger);
        if (costState.level === 'exceeded') {
          return buildErrorSseResponse({
            code: 'budget_exceeded',
            message: BUDGET_EXCEEDED_MESSAGE,
            retryable: false,
            status: 503,
            headers: rateLimitHeaders,
            anchorId: responseAnchorId,
          });
        }
      } catch (error) {
        logChatDebug('api.chat.cost_check_error', { error: String(error), correlationId });
      }
    }

    if (shouldReturnTestFixtures(request.headers)) {
      return buildFixtureResponse(rateLimitHeaders);
    }

    try {
      const client = await getOpenAIClient();
      const moderation = await moderateChatMessages(client, messages);
      if (moderation.flagged) {
        logChatDebug('api.chat.moderation_blocked', {
          categories: moderation.categories ?? [],
          correlationId,
        });
        return Response.json(
          { error: { code: 'input_moderated', message: MODERATION_REFUSAL_MESSAGE, retryable: false } },
          { status: 200, headers: rateLimitHeaders }
        );
      }
      const stream = createChatSseStream(chatApi, client, messages, {
        anchorId: responseAnchorId,
        runOptions: { ownerId, reasoningEnabled },
        outputModeration: {
          enabled: OUTPUT_MODERATION_ENABLED,
          model: OUTPUT_MODERATION_MODEL,
          refusalMessage: MODERATION_REFUSAL_MESSAGE,
          refusalBanner: MODERATION_REFUSAL_BANNER,
        },
        runtimeCost: runtimeCostClients
          ? {
              budgetExceededMessage: BUDGET_EXCEEDED_MESSAGE,
              onResult: async (result) => {
                const fromUsage = Array.isArray(result.usage)
                  ? result.usage.reduce((acc, entry) => acc + (entry?.costUsd ?? 0), 0)
                  : 0;
                const costUsd = typeof result.totalCostUsd === 'number' ? result.totalCostUsd : fromUsage;
                try {
                  return await recordRuntimeCost(runtimeCostClients, costUsd, chatLogger);
                } catch (error) {
                  logChatDebug('api.chat.cost_record_error', { error: String(error), correlationId });
                  return undefined;
                }
              },
            }
          : undefined,
        onError: (error: unknown) =>
          logChatDebug('api.chat.pipeline_error', { error: String(error), correlationId }),
      });
      return new Response(stream, { headers: { ...SSE_HEADERS, ...rateLimitHeaders } });
    } catch (error) {
      logChatDebug('api.chat.error', { error: String(error), correlationId });
      return new Response('Chat unavailable', { status: 500 });
    }
  });
}
