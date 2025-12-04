# E2E Testing Guide

Playwright drives full-stack verification for the portfolio with a **unified testing architecture** that cleanly separates behavioral E2E tests from integration tests.

## 🎯 Testing Philosophy

We support **two distinct test types** with one clear API:

1. **E2E/Behavioral Tests** - Fast, deterministic tests using fixtures to verify UI behavior
2. **Integration Tests** - Verify real services (AWS, GitHub, OpenAI) work correctly

### Architecture: Two Independent Layers

#### Layer 1: Runtime Fixture Flag (Infrastructure)

- **What**: Determines whether blog APIs use mock fixtures or DynamoDB/S3
- **When**: Only when `BLOG_TEST_FIXTURES=true` (Playwright/local dev opt-in) and never in production (flag causes a fail-fast)
- **Function**: `shouldUseBlogFixtureRuntime()` - checks the explicit env flag

#### Layer 2: Test Fixtures (Request-Scoped)

- **What**: Returns deterministic fixtures for E2E tests (via dynamic imports)
- **When**: Any test that needs predictable data and has opted into fixture flags
- **Function**: `shouldServeFixturesForRequest()` - requires a fixture flag and the `x-portfolio-test-mode` header (header is ignored in production)

**Key Insight**: APIs call `shouldServeFixturesForRequest()` and only load fixtures via dynamic import when fixture flags are enabled. Playwright sets `PORTFOLIO_TEST_FIXTURES=true` and `BLOG_TEST_FIXTURES=true` when it boots the local dev server; production ignores headers entirely and will throw if a fixture flag leaks into prod.

## 🚀 Quick Start

```bash
# Install deps + browsers (first run)
pnpm install
pnpm exec playwright install

# Run E2E tests (fast, fixtures)
pnpm test

# Run integration tests (real APIs)
pnpm test:real-api

# Develop interactively
pnpm test:ui

# View the latest HTML report
pnpm test:report
```

## 📋 Coverage Snapshot

- ✅ **Global navigation** – hero render, header links, resume modal, project detail pages, blog list & article view.
- ✅ **Projects + knowledge flows** – opening project cards, README rendering, doc breadcrumbs.
- ✅ **Blog** – handles both "no posts yet" and published article paths.
- ✅ **Contact** – native validation, success toast, and API error handling.
- ✅ **Chat** – full message send using SSE streaming, portfolio UI surfaces, README doc links, and document fetching.
- ✅ **Error surfaces** – ensures users see actionable messaging without relying on real upstream services.

### Test Suites

```
e2e/
├── site-flows.spec.ts         # Navigation, pages, projects, blog (E2E)
├── engagement.spec.ts         # Contact form + chat interactions (E2E)
└── api-integration.spec.ts    # Real service verification (Integration)
```

## 🎯 Everyday Commands

| Command                            | Description                                                    | Uses Fixtures? |
| ---------------------------------- | -------------------------------------------------------------- | -------------- |
| `pnpm test`                        | Run the full suite (headless Chromium)                         | ✅ Yes         |
| `pnpm test:ui`                     | Visual runner with watch mode                                  | ✅ Yes         |
| `pnpm test:headed`                 | Headed Chromium without the UI window                          | ✅ Yes         |
| `pnpm test:debug`                  | Debug session with Playwright Inspector                        | ✅ Yes         |
| `pnpm test e2e/site-flows.spec.ts` | Execute a single file                                          | ✅ Yes         |
| `pnpm test --grep "contact form"`  | Run tests matching a title/name pattern                        | ✅ Yes         |
| `pnpm test:report`                 | Open the HTML report from the last run                         | N/A            |
| `pnpm run test:real-api`           | Real smoke suite against an already running host               | ❌ No (real)   |
| `pnpm run test:real-api:dev`       | Same real suite but auto-starts the local dev app              | ❌ No (real)   |
| `pnpm run test:real-ui`            | Run the real UI suite against an existing host (no dev server) | ❌ No (real)   |
| `pnpm run test:real-ui:dev`        | Same suite but auto-starts `pnpm dev` when targeting localhost | ❌ No (real)   |
| `pnpm run test:real-ui:dev:headed` | Headed Chromium run of the local real UI suite                 | ❌ No (real)   |

## 🔧 How Testing Works

### Simple Rule: Headers for API, Flag for SSR

**API Routes** → Check request header:

```typescript
export async function GET(request: Request) {
  // Playwright sends 'x-portfolio-test-mode: e2e' header during local/CI mock runs
  if (shouldServeFixturesForRequest(request.headers)) {
    const { TEST_FIXTURES } = await import('@portfolio/test-support/fixtures');
    return NextResponse.json(TEST_FIXTURES);
  }
  // Otherwise use real data
  return NextResponse.json(await fetchRealData());
}
```

**SSR Pages** → Check runtime flag:

```typescript
export async function fetchPortfolioRepos() {
  // When PORTFOLIO_TEST_FIXTURES is set (pnpm test), use deterministic data
  if (process.env.PORTFOLIO_TEST_FIXTURES === 'true') {
    const { TEST_FIXTURES } = await import('@portfolio/test-support/fixtures');
    return TEST_FIXTURES;
  }
  return await fetchFromGitHub();
}
```

### Why Two Approaches?

- **API routes** get request headers → can detect test mode per-request
- **SSR pages** render at build time → no request headers, use environment instead
- Both ensure: ✅ Tests get fixtures (only when flags are set), ✅ Production gets real data and fails fast if fixture flags are present

### What You Get

| Test Type       | Command              | Uses Fixtures? | Tests What?                         |
| --------------- | -------------------- | -------------- | ----------------------------------- |
| **E2E**         | `pnpm test`          | ✅ Yes         | UI behavior with predictable data   |
| **Integration** | `pnpm test:real-api` | ❌ No          | Real AWS/GitHub/OpenAI integrations |
| **Local Dev**   | `pnpm dev`           | ✅ Yes\*       | Works without AWS credentials       |
| **Production**  | (deployed)           | ❌ No          | Real data from real services        |

_\*Set `PORTFOLIO_TEST_FIXTURES=true` to opt into fixtures locally (Playwright does this automatically)_

### Key Environment Variables

| Variable                       | What It Does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `PORTFOLIO_TEST_FIXTURES=true` | Forces SSR/data loaders to return fixtures (used by tests) |
| `CI=true`                      | Enables Playwright defaults (retries, workers, etc.)       |
| `BLOG_TEST_FIXTURES=true`      | Forces blog APIs to use mock data (set during tests)       |
| `E2E_USE_REAL_APIS=true`       | Integration tests use real services                        |
| `PLAYWRIGHT_TEST_BASE_URL`     | Override what URL to test against                          |

## 🧪 E2E Tests (Fast & Reliable)

Playwright automatically sends `x-portfolio-test-mode: e2e` header and sets the fixture flags when running in mock mode (local dev/CI), making all APIs return predictable test data. Production deployments ignore this header entirely and will fail fast if fixture flags are present, so real traffic cannot opt into mocks.

**Benefits:**

- ⚡ Fast (no real API calls)
- 🎯 Deterministic (same data every time)
- 🔒 Safe (production ignores the header; real users cannot trigger fixtures)

**What gets mocked:**

- Blog posts, projects, chat responses, READMEs, etc.
- Some external services need network stubbing (see `engagement.spec.ts` for examples)

## 🔌 Integration Tests (Real Services)

Verify that AWS, GitHub, OpenAI, and email actually work. Run with `pnpm test:real-api`.

**Tests real integrations:**

- AWS DynamoDB & S3 (blog posts)
- GitHub API (repos, READMEs)
- OpenAI chat (costs $$$)
- Email sending (sends real emails!)

**Setup:** Set `E2E_USE_REAL_APIS=true` and required API credentials (AWS, GitHub token, OpenAI key).

⚠️ **Warning:** Costs money (OpenAI) and sends real emails!

## 🔄 CI / CD

Our GitHub Actions workflows use the unified testing architecture:

### `.github/workflows/test.yml` (PR checks)

- Runs E2E tests with `x-portfolio-test-mode: e2e` header while targeting the local dev server (never production)
- Fast, deterministic fixture-based tests
- No real API calls, no costs
- Validates UI behavior before merge

### `.github/workflows/deploy.yml` (Deployment)

1. **Pre-deployment**: E2E tests with fixtures (fast safety check)
2. **Deploy**: CDK stack to AWS
3. **Post-deployment**: Integration tests with `E2E_USE_REAL_APIS=true`
   - Verifies real AWS resources (DynamoDB, S3, CloudFront)
   - Validates Lambda@Edge environment variables
   - Confirms blog/project APIs work in production

### Artifacts & Debugging

- Test failures upload `playwright-report/` artifacts (30 day retention)
- Traces and videos captured on first retry
- View reports in GitHub Actions → Artifacts section

## ✍️ Authoring New Tests

### E2E Test (Fixture-Based)

```ts
import { test, expect } from '@playwright/test';

test('displays blog posts correctly', async ({ page }) => {
  // Playwright injects x-portfolio-test-mode: e2e and starts dev with PORTFOLIO_TEST_FIXTURES/BLOG_TEST_FIXTURES
  // API will return TEST_BLOG_POSTS fixture

  await page.goto('/blog');
  await expect(page.getByRole('heading')).toContainText('Shipping AI Updates');
});

test('contact form validation', async ({ page }) => {
  await page.goto('/contact');
  await page.getByPlaceholder('name...').fill('Test User');

  // Stub external service not covered by test mode
  await page.route('**/api/send-email', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
  });

  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByText(/sent/i)).toBeVisible();
});
```

### Integration Test (Real Services)

```ts
import { test, expect } from '@playwright/test';

test('fetches real GitHub repos', async ({ request }) => {
  // Test runs with E2E_USE_REAL_APIS=true
  // No test mode header sent → real GitHub API call

  const response = await request.get('/api/github/portfolio-repos');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.starred.length).toBeGreaterThan(0);
  expect(data.starred[0].owner.login).toBe('volpestyle');
});
```

### Guidelines

**For all tests:**

- ✅ Use semantic queries (`getByRole`, `getByLabel`, `getByPlaceholder`)
- ✅ Keep tests isolated - navigate within each test
- ✅ Add `page.route` **before** triggering the request
- ✅ Assert user-facing behavior, not implementation details

**For E2E tests:**

- ✅ Rely on automatic `x-portfolio-test-mode: e2e` header when running locally/in CI (production ignores it)
- ✅ Expect deterministic TEST\_\* fixtures from APIs
- ✅ Focus on UI behavior and user flows
- ✅ Should be fast and never flaky

**For integration tests:**

- ✅ Run with `E2E_USE_REAL_APIS=true`
- ✅ Expect real data from services
- ✅ Verify integrations actually work
- ✅ Account for costs and side effects

---

## 🎯 Quick Decision Guide

**"Should I write an E2E test or integration test?"**

| You want to...              | Test Type   | Command              |
| --------------------------- | ----------- | -------------------- |
| Verify button clicks work   | E2E         | `pnpm test`          |
| Check form validation       | E2E         | `pnpm test`          |
| Test navigation flows       | E2E         | `pnpm test`          |
| Verify AWS DynamoDB works   | Integration | `pnpm test:real-api` |
| Test GitHub API integration | Integration | `pnpm test:real-api` |
| Confirm email sending works | Integration | `pnpm test:real-api` |

**When in doubt**: Write an E2E test first (fast, safe). Add integration tests when you need to verify the real service connection.

---

Run `pnpm test` before pushing to catch regressions early! 🚀
