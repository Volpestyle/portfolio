import { NextRequest } from 'next/server';
import {
  createNextChatHandler,
  getRuntimeCostClients,
  recordRuntimeCost,
  shouldThrottleForBudget,
  setRuntimeCostBudget,
} from '@portfolio/chat-next-api';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';
import { buildRateLimitHeaders, enforceChatRateLimit } from '@/lib/rate-limit';
import { getLlmClient } from '@/server/llm/client';
import { chatApi, chatLogger, chatRuntimeOptions, chatModerationOptions, chatProvider } from '@/server/chat/pipeline';
import { resolveSecretValue } from '@/lib/secrets/manager';
import { getSettings } from '@/server/admin/settings-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatHandler = createNextChatHandler({
  chatApi,
  chatLogger,
  chatRuntimeOptions,
  getLlmClient: () => getLlmClient(chatProvider),
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

async function _getChatOriginSecret(): Promise<string | null> {
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
  const _isDev = process.env.NODE_ENV === 'development';
  // Temporarily disable origin secret enforcement
  // if (!isDev) {
  //   const expectedSecret = await getChatOriginSecret();
  //   if (expectedSecret) {
  //     const provided = request.headers.get('x-chat-origin-secret');
  //     if (provided !== expectedSecret) {
  //       return new Response('Forbidden', { status: 403 });
  //     }
  //   }
  // }

  // Load runtime settings (chat enabled + monthly cost limit)
  let chatEnabled = true;
  let monthlyCostLimit: number | undefined;
  try {
    const settings = await getSettings();
    chatEnabled = settings.chatEnabled;
    monthlyCostLimit = settings.monthlyCostLimitUsd;
  } catch {
    // Fail open: keep defaults
  }

  if (!chatEnabled) {
    return new Response('Chat is temporarily disabled', { status: 503 });
  }

  // Update runtime cost budget from admin settings (if configured)
  if (typeof monthlyCostLimit === 'number' && monthlyCostLimit > 0) {
    setRuntimeCostBudget(monthlyCostLimit);
  }

  return chatHandler.POST(request);
}
