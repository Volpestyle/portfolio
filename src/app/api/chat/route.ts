import { NextRequest } from 'next/server';
import { createNextChatHandler, getRuntimeCostClients, recordRuntimeCost, shouldThrottleForBudget } from '@portfolio/chat-next-api';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';
import { buildRateLimitHeaders, enforceChatRateLimit } from '@/lib/rate-limit';
import { getOpenAIClient } from '@/server/openai/client';
import { chatApi, chatLogger, chatOwnerId, chatRuntimeOptions } from '@/server/chat/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatHandler = createNextChatHandler({
  chatApi,
  chatOwnerId,
  chatLogger,
  chatRuntimeOptions,
  getOpenAIClient,
  enforceRateLimit: async (request: NextRequest) => {
    const result = await enforceChatRateLimit(request);
    return {
      ...result,
      headers: buildRateLimitHeaders(result),
    };
  },
  shouldServeFixtures: shouldServeFixturesForRequest,
  buildFixtureResponse: async ({ answerModel, headers }) => {
    const { buildChatFixtureResponse } = await import('@portfolio/test-support/chat/fixture-response');
    return buildChatFixtureResponse({ answerModel, headers });
  },
  inputModeration: {
    enabled: false,
  },
  outputModeration: {
    enabled: true,
  },
  runtimeCost: {
    getClients: getRuntimeCostClients,
    shouldThrottleForBudget,
    recordRuntimeCost,
  },
});

export async function POST(request: NextRequest) {
  return chatHandler.POST(request);
}
