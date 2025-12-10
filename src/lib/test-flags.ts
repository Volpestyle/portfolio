const TEST_MODE_HEADER = 'x-portfolio-test-mode';
const ADMIN_SECRET_HEADER = 'x-portfolio-admin-secret';
const PORTFOLIO_FIXTURE_RUNTIME_FLAG = 'PORTFOLIO_TEST_FIXTURES';
const BLOG_FIXTURE_RUNTIME_FLAG = 'BLOG_TEST_FIXTURES';
const ALLOW_FIXTURES_IN_PROD_FLAG = 'ALLOW_TEST_FIXTURES_IN_PROD';

type HeadersLike = Pick<Headers, 'get'>;
type TestMode = 'e2e' | 'integration' | null;

const isProduction = () => process.env.NODE_ENV === 'production';
const flagEnabled = (flag: string) => process.env[flag] === 'true';
const allowProdFixtures = () => flagEnabled(ALLOW_FIXTURES_IN_PROD_FLAG);

function shouldSkipFixtures(): boolean {
  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return true;
  }
  if (process.env.SKIP_TEST_FIXTURES === 'true') {
    return true;
  }
  return false;
}

export function assertNoFixtureFlagsInProd(): void {
  if (!isProduction()) {
    return;
  }
  if (allowProdFixtures()) {
    return;
  }
  const enabledFlags = [PORTFOLIO_FIXTURE_RUNTIME_FLAG, BLOG_FIXTURE_RUNTIME_FLAG].filter((flag) => flagEnabled(flag));
  if (enabledFlags.length > 0) {
    throw new Error(
      `Test fixture flags are set in production: ${enabledFlags.join(', ')}. Remove these env vars in prod.`
    );
  }
}

export function shouldUseFixtureRuntime(flag: string = PORTFOLIO_FIXTURE_RUNTIME_FLAG): boolean {
  if (isProduction() && !allowProdFixtures()) {
    assertNoFixtureFlagsInProd();
    return false;
  }
  if (shouldSkipFixtures()) {
    return false;
  }
  return flagEnabled(flag);
}

export function shouldUseBlogFixtureRuntime(): boolean {
  return shouldUseFixtureRuntime(BLOG_FIXTURE_RUNTIME_FLAG);
}

export function resolveTestMode(headers: HeadersLike): TestMode {
  const value = headers.get(TEST_MODE_HEADER);
  if (value === 'e2e' || value === 'integration') {
    return value;
  }
  return null;
}

export function shouldServeFixturesForRequest(headers: HeadersLike, options: { fixtureFlag?: string } = {}): boolean {
  assertNoFixtureFlagsInProd();
  if (shouldSkipFixtures()) {
    return false;
  }

  const fixtureRuntimeEnabled = shouldUseFixtureRuntime(options.fixtureFlag);
  if (!fixtureRuntimeEnabled) {
    return false;
  }

  const mode = resolveTestMode(headers);
  if (mode === 'integration') {
    return false;
  }

  return true;
}

export function headerIncludesTestMode(headers: HeadersLike, mode: NonNullable<TestMode>): boolean {
  return resolveTestMode(headers) === mode;
}

export function hasAdminBypass(headers: HeadersLike): boolean {
  const secret = process.env.E2E_ADMIN_BYPASS_SECRET;
  if (!secret) {
    return false;
  }
  if (!shouldServeFixturesForRequest(headers)) {
    return false;
  }
  return headers.get(ADMIN_SECRET_HEADER) === secret;
}

export { TEST_MODE_HEADER, ADMIN_SECRET_HEADER, PORTFOLIO_FIXTURE_RUNTIME_FLAG, BLOG_FIXTURE_RUNTIME_FLAG };
