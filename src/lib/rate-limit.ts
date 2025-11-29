import 'server-only';

import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { resolveSecretValue } from '@/lib/secrets/manager';

type RateLimitRule = {
  name: string;
  window: Duration;
  tokens: number;
};

type RateLimitCheckResult = {
  name: string;
  window: Duration;
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

export type RateLimitResult = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  window?: Duration;
  reason?: string;
  checks?: RateLimitCheckResult[];
};

type RateLimiterInstance = RateLimitRule & { limiter: Ratelimit };

const RATE_LIMIT_RULES: RateLimitRule[] = [
  { name: 'per-minute', window: '1 m', tokens: 5 },
  { name: 'per-hour', window: '1 h', tokens: 40 },
  { name: 'per-day', window: '1 d', tokens: 120 },
];

const DEV_RATE_LIMIT_OVERRIDE = process.env.ENABLE_DEV_RATE_LIMIT?.toLowerCase();
const ENABLE_DEV_RATE_LIMIT = DEV_RATE_LIMIT_OVERRIDE === undefined ? true : DEV_RATE_LIMIT_OVERRIDE === 'true';
const RATE_LIMIT_RETRY_MS = 60_000;
const REDIS_RATE_LIMIT_PREFIX = 'chat:ratelimit';

let chatRateLimiters: RateLimiterInstance[] | null = null;
let chatRateLimiterPromise: Promise<RateLimiterInstance[] | null> | null = null;
let lastInitAttempt = 0;

async function initRateLimiters(): Promise<RateLimiterInstance[] | null> {
  try {
    const [url, token] = await Promise.all([
      resolveSecretValue('UPSTASH_REDIS_REST_URL', { scope: 'repo' }),
      resolveSecretValue('UPSTASH_REDIS_REST_TOKEN', { scope: 'repo' }),
    ]);

    if (!url || !token) {
      console.warn('Rate limiting disabled (Upstash credentials missing).');
      return null;
    }

    const redis = new Redis({
      url,
      token,
    });

    const normalizeRuleName = (name: string) => name.replace(/^per-/, '');

    return RATE_LIMIT_RULES.map((rule) => ({
      ...rule,
      limiter: new Ratelimit({
        redis,
        prefix: `${REDIS_RATE_LIMIT_PREFIX}:${normalizeRuleName(rule.name)}`,
        limiter: Ratelimit.slidingWindow(rule.tokens, rule.window),
        analytics: true,
      }),
    }));
  } catch (error) {
    console.warn('Rate limiting disabled (failed to initialize Upstash client).', error);
    return null;
  }
}

async function getRateLimiters(): Promise<RateLimiterInstance[] | null> {
  if (chatRateLimiters && chatRateLimiters.length) {
    return chatRateLimiters;
  }

  const now = Date.now();
  const withinRetryWindow = chatRateLimiters === null && now - lastInitAttempt < RATE_LIMIT_RETRY_MS;

  if (withinRetryWindow) {
    return chatRateLimiters;
  }

  if (!chatRateLimiterPromise) {
    lastInitAttempt = now;
    chatRateLimiterPromise = initRateLimiters().finally(() => {
      chatRateLimiterPromise = null;
    });
  }

  chatRateLimiters = await chatRateLimiterPromise;
  return chatRateLimiters;
}

function normalizeReset(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return Math.ceil(Date.now() / 1000) + 60;
  }
  // Upstash returns milliseconds since epoch; normalize to seconds for headers.
  return Math.ceil(value / 1000);
}

function buildFailureResult(reason: string): RateLimitResult {
  return {
    success: false,
    limit: 0,
    remaining: 0,
    reset: normalizeReset(null),
    window: '1 m',
    reason,
    checks: [],
  };
}

function getClientIp(req: NextRequest) {
  const reqWithIp = req as NextRequest & { ip?: string | null };
  if (reqWithIp.ip) {
    return reqWithIp.ip;
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const realIp = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip');
  if (realIp) {
    return realIp;
  }

  return null;
}

function getClientIdentifier(req: NextRequest) {
  const ip = getClientIp(req);
  // Key solely on IP to avoid user-controlled headers (e.g., User-Agent) bypassing limits.
  return ip;
}

export async function enforceChatRateLimit(req: NextRequest): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== 'production' && !ENABLE_DEV_RATE_LIMIT) {
    return {
      success: true,
      reason: 'Local rate limit bypassed (ENABLE_DEV_RATE_LIMIT=false)',
    };
  }

  const limiters = await getRateLimiters();
  if (!limiters || limiters.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      return {
        success: true,
        reason: 'Rate limiting disabled (Upstash credentials missing)',
      };
    }
    return buildFailureResult('Rate limiter unavailable');
  }

  const identifier = getClientIdentifier(req);
  if (!identifier) {
    return buildFailureResult('Unable to identify client IP');
  }
  const results: RateLimitCheckResult[] = [];

  try {
    for (const limiter of limiters) {
      const result = await limiter.limiter.limit(identifier);
      const normalizedReset = normalizeReset(result.reset);
      const check: RateLimitCheckResult = {
        name: limiter.name,
        window: limiter.window,
        limit: limiter.tokens,
        remaining: Math.max(0, result.remaining),
        reset: normalizedReset,
        success: result.success,
      };
      results.push(check);

      if (!result.success) {
        return {
          success: false,
          limit: limiter.tokens,
          remaining: check.remaining,
          reset: normalizedReset,
          window: limiter.window,
          reason: `Exceeded ${limiter.name} rate limit`,
          checks: results,
        };
      }
    }

    const primary = results.find((check) => check.name === 'per-hour') ?? results[results.length - 1];
    return {
      success: true,
      limit: primary?.limit,
      remaining: primary?.remaining,
      reset: primary?.reset,
      window: primary?.window,
      checks: results,
    };
  } catch (error) {
    console.error('Failed to execute rate limit check:', error);
    return buildFailureResult('Failed to execute rate limit check');
  }
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof result.limit === 'number' && result.limit > 0) {
    headers['RateLimit-Limit'] = `${result.limit}`;
  }
  if (typeof result.remaining === 'number' && result.remaining >= 0) {
    headers['RateLimit-Remaining'] = `${result.remaining}`;
  }
  if (typeof result.reset === 'number' && result.reset > 0) {
    headers['RateLimit-Reset'] = `${result.reset}`;
  }
  return headers;
}
