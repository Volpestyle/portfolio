# E2E Testing

End-to-end testing with Playwright.

## Configuration

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real-integration',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /api-integration/,
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Test Structure

```
e2e/
├── api-integration.spec.ts   # API endpoint tests
├── site-flows.spec.ts        # Page navigation tests
├── engagement.spec.ts        # User interaction tests
└── fixtures/                 # Test utilities
```

## Writing Tests

### Page Navigation

```typescript
import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Portfolio/);
});

test('navigate to projects', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Projects');
  await expect(page).toHaveURL('/projects');
});
```

### API Testing

```typescript
import { test, expect } from '@playwright/test';

test('blog posts API returns data', async ({ request }) => {
  const response = await request.get('/api/posts');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.posts).toBeInstanceOf(Array);
});
```

### Form Interactions

```typescript
test('contact form submission', async ({ page }) => {
  await page.goto('/contact');

  await page.fill('input[name="name"]', 'Test User');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('textarea[name="message"]', 'Test message');

  await page.click('button[type="submit"]');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

## Test Fixtures

### Using Mock Data

```typescript
import { test } from '@playwright/test';
import { BLOG_TEST_FIXTURES } from '@portfolio/test-support/fixtures';

test('displays mock blog posts', async ({ page }) => {
  // Fixtures enabled via environment variable
  await page.goto('/blog');

  const firstPost = BLOG_TEST_FIXTURES.posts[0];
  await expect(page.locator('h2')).toContainText(firstPost.title);
});
```

### Custom Fixtures

```typescript
// e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Set up authentication
    await page.goto('/api/auth/signin');
    // ... authentication logic
    await use(page);
  },
});
```

## Running Tests

### Basic Commands

```bash
# Run all tests
pnpm test

# Run specific file
pnpm test e2e/site-flows.spec.ts

# Run tests matching pattern
pnpm test -g "blog"
```

### Visual Mode

```bash
# Open Playwright UI
pnpm test:ui
```

### Headed Mode

```bash
# Show browser during tests
pnpm test:headed
```

### Debug Mode

```bash
# Step through tests
pnpm test:debug
```

## Test Modes

### Fixture Mode (Default)

```bash
# Uses mock data
BLOG_TEST_FIXTURES=true PORTFOLIO_TEST_FIXTURES=true pnpm test
```

### Real API Mode

```bash
# Against deployed app
PLAYWRIGHT_SKIP_WEBSERVER=true E2E_USE_REAL_APIS=true pnpm test:real-api
```

### Hybrid Mode

```bash
# Local server with real APIs
E2E_USE_REAL_APIS=true pnpm test:real-api:dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_SKIP_WEBSERVER` | Don't start dev server |
| `PLAYWRIGHT_TEST_BASE_URL` | Override base URL |
| `E2E_USE_REAL_APIS` | Use real vs mock APIs |
| `E2E_API_BASE_URL` | Target API URL |
| `BLOG_TEST_FIXTURES` | Enable blog fixtures |
| `PORTFOLIO_TEST_FIXTURES` | Enable portfolio fixtures |

## CI Configuration

### GitHub Actions

```yaml
- name: Run E2E Tests
  env:
    CI: true
    BLOG_TEST_FIXTURES: 'true'
    PORTFOLIO_TEST_FIXTURES: 'true'
  run: pnpm test

- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

### Artifacts

Failed tests generate:
- Screenshots
- Videos
- Traces

View with:

```bash
pnpm test:report
```

## Best Practices

### Test Isolation

Each test should be independent:

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('test 1', async ({ page }) => {
  // Independent test
});

test('test 2', async ({ page }) => {
  // Independent test
});
```

### Reliable Selectors

Prefer data attributes:

```typescript
// Good
await page.click('[data-testid="submit-button"]');

// Avoid
await page.click('.btn-primary');
```

### Wait for Conditions

```typescript
// Wait for element
await expect(page.locator('.loading')).toBeHidden();

// Wait for network
await page.waitForResponse('/api/data');
```

### Error Handling

```typescript
test('handles API errors', async ({ page }) => {
  // Mock error response
  await page.route('/api/data', (route) => {
    route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Server error' }),
    });
  });

  await page.goto('/');
  await expect(page.locator('.error-message')).toBeVisible();
});
```

## Debugging

### Traces

Enable traces for debugging:

```typescript
use: {
  trace: 'on', // Always capture
}
```

View traces:

```bash
npx playwright show-trace trace.zip
```

### Screenshots

```typescript
test('visual test', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'screenshot.png' });
});
```

### Console Logs

```typescript
page.on('console', (msg) => {
  console.log('Browser log:', msg.text());
});
```

## Related Documentation

- [Testing Overview](./overview.md) - Testing strategy
- [Chat Evals](./chat-evals.md) - Chat testing
- [CI/CD](../deployment/ci-cd.md) - Automation
