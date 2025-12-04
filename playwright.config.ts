import { defineConfig, devices } from '@playwright/test';
import { resolveTestRuntime, buildProjectHeaders } from './e2e/utils/runtime-env';

const LOCAL_E2E_BASE = 'http://127.0.0.1:3000';
if (process.env.PLAYWRIGHT_SKIP_WEBSERVER !== 'true') {
  process.env.PLAYWRIGHT_TEST_BASE_URL ??= LOCAL_E2E_BASE;
}

const runtime = resolveTestRuntime();
const uiHeaders = buildProjectHeaders('ui', runtime);
const apiHeaders = buildProjectHeaders('api', runtime);
const shouldStartWebServer = runtime.isLocalBase && process.env.PLAYWRIGHT_SKIP_WEBSERVER !== 'true';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['html'], ['github'], ['list']] : [['html'], ['list']],

  /* Shared settings for all projects. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: runtime.baseUrl,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        extraHTTPHeaders: {
          ...uiHeaders,
        },
      },
    },
    {
      name: 'real-integration',
      testMatch: ['e2e/api-integration.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        extraHTTPHeaders: {
          ...apiHeaders,
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: shouldStartWebServer
    ? {
        // Use dev mode so tests run against a fresh Next build
        command: 'pnpm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
          ...process.env,
          BLOG_TEST_FIXTURES: 'true', // Force mock blog data for Playwright runs
          PORTFOLIO_TEST_FIXTURES: 'true', // Enable SSR fixtures while Playwright runs
        },
      }
    : undefined,
});
