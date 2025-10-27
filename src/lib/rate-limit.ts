'use server';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
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

function getRateLimiter() {
  if (chatRateLimiter !== undefined) {
    return chatRateLimiter;
  }

  try {
    const redis = Redis.fromEnv();
    chatRateLimiter = new Ratelimit({
      redis,
      prefix: 'ratelimit:chat',
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: true,
    });
    return chatRateLimiter;
  } catch (error) {
    console.warn('Rate limiting disabled (Upstash env vars missing or invalid).', error);
    chatRateLimiter = null;
    return chatRateLimiter;
  }
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
  const limiter = getRateLimiter();
  if (!limiter) {
    return { success: true };
  }

  const identifier = getClientIdentifier(req);
  try {
    return await limiter.limit(identifier);
  } catch (error) {
    console.error('Failed to execute rate limit check:', error);
    return { success: true };
  }
}
