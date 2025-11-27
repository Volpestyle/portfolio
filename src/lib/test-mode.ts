const TEST_MODE_HEADER = 'x-portfolio-test-mode';
const ADMIN_SECRET_HEADER = 'x-portfolio-admin-secret';
const PORTFOLIO_FIXTURE_RUNTIME_FLAG = 'PORTFOLIO_TEST_FIXTURES';
const BLOG_FIXTURE_RUNTIME_FLAG = 'BLOG_TEST_FIXTURES';

type HeadersLike = Pick<Headers, 'get'>;

/**
 * Test mode types for better type safety
 */
export type TestMode = 'e2e' | 'integration' | null;

export function isFixtureRuntime(flag: string = PORTFOLIO_FIXTURE_RUNTIME_FLAG): boolean {
  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return false;
  }
  if (process.env.SKIP_TEST_FIXTURES === 'true') {
    return false;
  }
  return process.env[flag] === 'true';
}

export function isBlogFixtureRuntime(): boolean {
  return isFixtureRuntime(BLOG_FIXTURE_RUNTIME_FLAG);
}

/**
 * Check if the request is in E2E test mode.
 * When true, APIs should return deterministic fixtures instead of real data.
 *
 * In production, the header alone cannot toggle fixtures—only explicit
 * runtime flags (which are stripped from prod) can enable them.
 *
 * @example
 * // In API route:
 * if (shouldReturnTestFixtures(request.headers)) {
 *   return NextResponse.json(TEST_FIXTURES);
 * }
 */
export function shouldReturnTestFixtures(headers: HeadersLike): boolean {
  // If explicitly running with real APIs for integration tests, never use fixtures
  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return false;
  }

  if (process.env.SKIP_TEST_FIXTURES === 'true') {
    return false;
  }

  const mode = headers.get(TEST_MODE_HEADER);

  // Explicit E2E mode = always use fixtures outside production.
  // In production we ignore the header unless the runtime itself
  // has been placed into a fixture mode via env flags.
  if (mode === 'e2e') {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    return isFixtureRuntime();
  }

  // Integration mode = use real APIs even with mock environment
  if (mode === 'integration') {
    return false;
  }

  return isFixtureRuntime();
}

export function headerIncludesTestMode(
  headers: HeadersLike,
  mode: NonNullable<TestMode>
): boolean {
  return headers.get(TEST_MODE_HEADER) === mode;
}

export function hasAdminBypass(headers: HeadersLike): boolean {
  const secret = process.env.E2E_ADMIN_BYPASS_SECRET;
  if (!secret) {
    return false;
  }
  if (!shouldReturnTestFixtures(headers)) {
    return false;
  }
  return headers.get(ADMIN_SECRET_HEADER) === secret;
}
