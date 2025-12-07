import { NextRequest } from 'next/server';
import {
  createNextChatHandler,
  getRuntimeCostClients,
  recordRuntimeCost,
  shouldThrottleForBudget,
} from '@portfolio/chat-next-api';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';
import { buildRateLimitHeaders, enforceChatRateLimit } from '@/lib/rate-limit';
import { getOpenAIClient } from '@/server/openai/client';
import { chatApi, chatLogger, chatRuntimeOptions, chatModerationOptions } from '@/server/chat/pipeline';
import { resolveSecretValue } from '@/lib/secrets/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatHandler = createNextChatHandler({
  chatApi,
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
    enabled: chatModerationOptions?.input?.enabled ?? false,
    model: chatModerationOptions?.input?.model,
  },
  outputModeration: {
    enabled: chatModerationOptions?.output?.enabled ?? false,
    model: chatModerationOptions?.output?.model,
    refusalMessage: chatModerationOptions?.output?.refusalMessage,
    refusalBanner: chatModerationOptions?.output?.refusalBanner,
  },
  runtimeCost: {
    getClients: getRuntimeCostClients,
    shouldThrottleForBudget,
    recordRuntimeCost,
  },
});

let chatOriginSecret: string | null | undefined;
let chatOriginSecretPromise: Promise<string | null> | null = null;

async function getChatOriginSecret(): Promise<string | null> {
  if (chatOriginSecret !== undefined) {
    return chatOriginSecret;
  }
  if (!chatOriginSecretPromise) {
    chatOriginSecretPromise = resolveSecretValue('CHAT_ORIGIN_SECRET', { scope: 'repo', fallbackEnvVar: 'REVALIDATE_SECRET' })
      .then((value) => value ?? null)
      .catch(() => null)
      .finally(() => {
        chatOriginSecretPromise = null;
      });
  }
  chatOriginSecret = await chatOriginSecretPromise;
  return chatOriginSecret;
}

export async function POST(request: NextRequest) {
  const expectedSecret = await getChatOriginSecret();
  if (expectedSecret) {
    const provided = request.headers.get('x-chat-origin-secret');
    if (provided !== expectedSecret) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return chatHandler.POST(request);
}
