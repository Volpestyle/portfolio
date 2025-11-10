import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTestRuntime, buildProjectHeaders } from './e2e/utils/runtime-env';

// Load environment variables
const envFile = process.env.CI ? '.env.production' : '.env.local';
const envPath = path.resolve(process.cwd(), envFile);
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

// Set test defaults (application mode is handled centrally in test-mode.ts)
process.env.E2E_ADMIN_BYPASS_SECRET ??= 'playwright-admin-secret';
process.env.E2E_ADMIN_BYPASS_EMAIL ??= 'playwright-admin@example.com';
process.env.POSTS_TABLE ??= 'playwright-posts';
process.env.CONTENT_BUCKET ??= 'playwright-content';
process.env.MEDIA_BUCKET ??= 'playwright-media';

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
  reporter: process.env.CI
    ? [['html'], ['github'], ['list']]
    : [['html'], ['list']],

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
      command: process.env.CI ? 'pnpm exec next start -p 3000' : 'pnpm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    }
    : undefined,
});
