'use server';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { resolveSecretValue } from '@/lib/secrets/manager';
type RateLimitResult =
  | ({
      success: true;
      limit: number;
      remaining: number;
      reset: number;
    } & Record<string, unknown>)
  | ({
      success: false;
      limit: number;
      remaining: number;
      reset: number;
    } & Record<string, unknown>)
  | {
      success: true;
      limit?: number;
      remaining?: number;
      reset?: number;
    };

let chatRateLimiter: Ratelimit | null | undefined;
let chatRateLimiterPromise: Promise<Ratelimit | null> | null = null;

async function initRateLimiter(): Promise<Ratelimit | null> {
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

    return new Ratelimit({
      redis,
      prefix: 'ratelimit:chat',
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: true,
    });
  } catch (error) {
    console.warn('Rate limiting disabled (failed to initialize Upstash client).', error);
    return null;
  }
}

async function getRateLimiter(): Promise<Ratelimit | null> {
  if (chatRateLimiter !== undefined) {
    return chatRateLimiter;
  }

  if (!chatRateLimiterPromise) {
    chatRateLimiterPromise = initRateLimiter().finally(() => {
      chatRateLimiterPromise = null;
    });
  }

  chatRateLimiter = await chatRateLimiterPromise;
  return chatRateLimiter;
}

function buildFailureResult(reason: string): RateLimitResult {
  const reset = Math.floor(Date.now() / 1000) + 60;
  return {
    success: false,
    limit: 0,
    remaining: 0,
    reset,
    reason,
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

  return 'unknown';
}

function getClientIdentifier(req: NextRequest) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent}`;
}

export async function enforceChatRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const limiter = await getRateLimiter();
  if (!limiter) {
    return buildFailureResult('Rate limiter unavailable');
  }

  const identifier = getClientIdentifier(req);
  try {
    return await limiter.limit(identifier);
  } catch (error) {
    console.error('Failed to execute rate limit check:', error);
    return buildFailureResult('Failed to execute rate limit check');
  }
}
