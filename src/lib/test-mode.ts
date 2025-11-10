import { isMockBlogStore } from '@/lib/blog-store-mode';

export const TEST_MODE_HEADER = 'x-portfolio-test-mode';
export const ADMIN_SECRET_HEADER = 'x-portfolio-admin-secret';

type HeadersLike = Pick<Headers, 'get'>;

/**
 * Test mode types for better type safety
 */
export type TestMode = 'e2e' | 'integration' | null;

/**
 * Overall application mode for centralized mode detection
 */
export type ApplicationMode = 'mock' | 'real-api' | 'production';

/**
 * Simple header detection - direct approach that's more reliable
 * than the complex multi-header parsing logic
 */
export function getTestMode(headers: HeadersLike): TestMode {
  const value = headers.get(TEST_MODE_HEADER);
  if (value === 'integration' || value === 'e2e') {
    return value;
  }
  return null;
}

/**
 * Centralized mode detection that provides a single source of truth
 * for determining the current application mode
 */
export function getCurrentApplicationMode(): ApplicationMode {
  // Real API mode takes precedence - explicitly enabled for expensive integration tests
  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return 'real-api';
  }

  // Production mode - when running in CI or production environment
  if (process.env.CI || process.env.NODE_ENV === 'production') {
    return 'production';
  }

  // Default to mock mode for development and local testing
  return 'mock';
}

export function headerIncludesTestMode(
  headers: HeadersLike,
  mode: NonNullable<TestMode>
): boolean {
  return headers.get(TEST_MODE_HEADER) === mode;
}

export function isE2ETestMode(headers: HeadersLike): boolean {
  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return false;
  }

  const mode = headers.get(TEST_MODE_HEADER);

  // Integration mode takes precedence
  if (mode === 'integration') {
    return false;
  }

  // Explicit E2E mode or mock environment
  return mode === 'e2e' || isMockBlogStore;
}

export function hasAdminBypass(headers: HeadersLike): boolean {
  const secret = process.env.E2E_ADMIN_BYPASS_SECRET;
  if (!secret) {
    return false;
  }
  if (!isE2ETestMode(headers)) {
    return false;
  }
  return headers.get(ADMIN_SECRET_HEADER) === secret;
}
