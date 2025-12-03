import type { NextRequest } from 'next/server';

export type RateLimitResult = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  window?: string;
  reason?: string;
  headers?: HeadersInit;
  status?: number;
};

export type RateLimitChecker = (identifier: string) => Promise<RateLimitResult>;
export type RateLimitIdentifier = (req: NextRequest) => string | null;

type RateLimitEnforcerOptions = {
  identify: RateLimitIdentifier;
  limit: RateLimitChecker;
  buildHeaders?: (result: RateLimitResult) => HeadersInit;
  failClosedMessage?: string;
};

/**
 * Build a Next.js-friendly rate limit enforcer from a generic limiter + identifier extractor.
 * The limiter stays app-configurable (e.g., Upstash, API Gateway, in-memory) and this helper
 * just normalizes the response shape expected by createNextChatHandler.
 */
export function createRateLimitEnforcer(options: RateLimitEnforcerOptions) {
  const failClosedMessage = options.failClosedMessage ?? 'Rate limiter unavailable';

  return async function enforce(req: NextRequest): Promise<RateLimitResult> {
    const identifier = options.identify(req);
    if (!identifier) {
      return {
        success: false,
        reason: 'Unable to identify client',
        status: 400,
      };
    }

    try {
      const result = await options.limit(identifier);
      const headers = options.buildHeaders ? options.buildHeaders(result) : result.headers;
      return headers ? { ...result, headers } : result;
    } catch (error) {
      console.warn('[chat-next-api] rate limit check failed, failing closed', error);
      return {
        success: false,
        reason: failClosedMessage,
        status: 503,
      };
    }
  };
}
