# E2E Testing Guide

Playwright drives full-stack verification for the portfolio. The suite now focuses on realistic flows (navigation, projects, blog, contact, and chat) while keeping the runtime lean on a single Chromium runner.

## 🚀 Quick Start

```bash
# Install deps + browsers (first run)
pnpm install
pnpm exec playwright install

# Run everything headless
pnpm test

# Develop interactively
pnpm test:ui

# View the latest HTML report
pnpm test:report
```

## 📋 Coverage Snapshot

- ✅ **Global navigation** – hero render, header links, resume modal, project detail pages, blog list & article view.
- ✅ **Projects + knowledge flows** – opening project cards, README rendering, doc breadcrumbs.
- ✅ **Blog** – handles both “no posts yet” and published article paths.
- ✅ **Contact** – native validation, success toast, and API error handling (mocked).
- ✅ **Chat** – full message send using the built-in SSE test mode, project card attachments, README doc links, and document fetching.
- ✅ **Error surfaces** – ensures users see actionable messaging without relying on real upstream services.

### Test Suites

```
e2e/
├── site-flows.spec.ts         # Navigation, pages, projects, blog
├── engagement.spec.ts         # Contact form + chat interactions
└── api-integration.spec.ts    # Remote API checks (requires E2E_API_* envs)
```

## 🎯 Everyday Commands

| Command                                | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `pnpm test`                            | Run the full suite (headless Chromium)             |
| `pnpm test:ui`                         | Visual runner with watch mode                      |
| `pnpm test:headed`                     | Headed Chromium without the UI window              |
| `pnpm test:debug`                      | Debug session with Playwright Inspector            |
| `pnpm test e2e/site-flows.spec.ts`     | Execute a single file                              |
| `pnpm test --grep "contact form"`      | Run tests matching a title/name pattern            |
| `pnpm test:report`                     | Open the HTML report from the last run             |
| `pnpm run test:real-api`               | Real smoke suite against an already running host   |
| `pnpm run test:real-api:dev`           | Same real suite but auto-starts the local dev app  |
| `pnpm run test:real-ui`                | Run the real UI suite against an existing host (no dev server) |
| `pnpm run test:real-ui:dev`            | Same suite but auto-starts `pnpm dev` when targeting localhost |
| `pnpm run test:real-ui:dev:headed`     | Headed Chromium run of the local real UI suite     |

## 🔧 Configuration Notes

- `playwright.config.ts` now exposes two projects: `chromium` (full UI + mocks) and `real-integration` (API smoke tests). Use `--project=real-integration` or `pnpm run test:real-api` when you want to bypass mocks.
- The config defaults `BLOG_STORE_MODE=mock` only when no blog-store infra env vars (`POSTS_TABLE`, `CONTENT_BUCKET`, `MEDIA_BUCKET`) are present. Export those (or set `BLOG_STORE_MODE=aws`) before `pnpm test` if you want the suite to exercise the real DynamoDB/S3 store.
- The runner automatically picks the test origin in this order: `PLAYWRIGHT_TEST_BASE_URL` → `E2E_API_BASE_URL` → `APP_DOMAIN_NAME` → `NEXT_PUBLIC_SITE_URL` → `http://localhost:3000`. Anything that isn’t localhost flips the suite into integration mode automatically (dev server skipped, mocks disabled, requests hit the real origin).
- Override the automatic detection with `E2E_TEST_MODE=mock|integration|real`. `mock` forces fixtures even when you point at a preview build, `integration` disables mocks without forcing the extra “real” assertions, and `real` (or `E2E_USE_REAL_APIS=true`) ensures every call hits external providers even on localhost.
- The dev server now starts only when the detected origin is local. Set `PLAYWRIGHT_SKIP_WEBSERVER=true` to skip it manually (or `PLAYWRIGHT_SKIP_WEBSERVER=false` if you really want to start it while pointing at a remote URL).
- In mock mode the config injects the test-mode headers for you: UI flows get `x-portfolio-test-mode: e2e`, API smoke tests get `x-portfolio-test-mode: integration`. As soon as you target a remote origin or force `integration/real`, those headers disappear so the app exercises the true providers.
- CI retries remain enabled (`retries: 2` on CI), and traces/videos are still captured on the first retry for easier debugging.

## 🧪 Mocking External Systems

- Use `page.route('**/api/send-email', ...)` to control SES responses. See `engagement.spec.ts` for helpers that simulate both success and failure.
- When the runtime is in mock mode, the runner automatically adds `x-portfolio-test-mode: e2e` so `/api/chat` and `/api/github/document` return deterministic fixtures. Force that behavior with `E2E_TEST_MODE=mock` if you need fixtures while targeting a remote preview.

## 🌐 Remote API Integration

`e2e/api-integration.spec.ts` shares the same base URL as the UI suite, so pointing `PLAYWRIGHT_TEST_BASE_URL` (or `E2E_API_BASE_URL`) at a preview automatically redirects the API checks there too. When the runtime is in mock mode (localhost), Playwright injects `x-portfolio-test-mode: integration` so chat/email short-circuit. As soon as you target any remote origin—or force `E2E_TEST_MODE=integration|real`—those headers are dropped and the tests expect the live providers.

Optional knobs:

| Env Var              | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `E2E_API_REPO_OWNER` | Owner/organization for `/api/github/repo-info` & `/document` checks     |
| `E2E_API_REPO_NAME`  | Repository name for the repo/document checks                            |
| `E2E_API_DOC_PATH`   | Optional repo-relative doc path (e.g., `docs/API.md`) for document test |

The discrete repo/doc tests skip automatically when their env vars are absent. The chat + email routes only short-circuit when the injected header is present (i.e., mock mode), so integration runs now exercise the true OpenAI/SES stacks by default.

### 🔥 Real API Smoke Tests

Need to verify an actual deployment (OpenAI, SES, GitHub, etc.)? Flip on the new real mode:

```bash
# Run once you have a deployed base URL and secrets available
E2E_API_BASE_URL=https://your-domain.com \
PLAYWRIGHT_SKIP_WEBSERVER=true \
E2E_USE_REAL_APIS=true \
pnpm exec playwright test --project=real-integration

# or use the shortcuts
pnpm run test:real-api            # assumes target server already running
pnpm run test:real-ui             # real Chromium UI suite against the resolved base URL (dev server never started)

# local dev convenience (spins up `pnpm dev` automatically)
pnpm run test:real-api:dev        # runs the real suite against http://localhost:3000
pnpm run test:real-ui:dev         # same UI suite; auto-starts pnpm dev when the base URL is localhost
pnpm run test:real-ui:dev:headed  # same dev flow but opens Chromium in headed mode
```

- `E2E_USE_REAL_APIS=true` tells both `api-integration.spec.ts` and the primary UI suite to hit live providers, so the chat + contact flows exercise OpenAI/SES rather than fixtures.
- `PLAYWRIGHT_SKIP_WEBSERVER=true` keeps Playwright from launching `pnpm dev`, since the tests talk to your deployed URL (or a dev server you started yourself).
- `pnpm run test:real-ui:dev` omits that flag. When the base URL resolves to `http://localhost:3000`, Playwright launches `pnpm dev` for you; if you override the base URL to a remote host, it behaves like `test:real-ui`.
- Use `pnpm run test:real-ui:dev:headed` (or append `--headed`) when you want the Chromium window for the local real run.
- The smoke run requires `E2E_API_BASE_URL` and re-uses optional repo/doc vars if you want GitHub content checks.
- Real chat calls stream SSE tokens and incur OpenAI + Upstash costs. Real contact tests send an SES email to the address hard-coded in the API route—point that route at a test inbox before enabling scheduled smoke runs.

## 🔄 CI / CD

- `.github/workflows/test.yml` runs on pull requests to `main`, ensuring every change gets E2E coverage before merge.
- `.github/workflows/deploy.yml` re-runs the mocked suite on `main` pushes right before the CDK deployment and then executes the real API smoke project after the stack finishes deploying.
- Failures upload `playwright-report/` artifacts for 30 days; grab them from the Actions run if you can’t reproduce locally.

### Test Mode Headers

- In mock mode the UI project sends `x-portfolio-test-mode: e2e` while the API project sends `x-portfolio-test-mode: integration`. Integration and real modes automatically drop both headers so you always hit the true environment.

## ✍️ Authoring New Tests

```ts
import { test, expect } from '@playwright/test';

test('example', async ({ page }) => {
  await page.goto('/contact');
  await page.getByPlaceholder('name...').fill('Automation');
  await page.getByRole('button', { name: /send message/i }).click();
  await expect(page.getByText(/Message sent/i)).toBeVisible();
});
```

Guidelines:

- Prefer semantic queries (`getByRole`, `getByLabel`, `getByPlaceholder`) to stay resilient against cosmetic changes.
- Keep tests isolated—navigate within each test rather than relying on shared state.
- When stubbing network calls, add the `page.route` hook **before** triggering the action that fires the request.
- If a page depends on remote content, assert the user-facing fallback (empty states, toasts) so regressions are still caught even when data is unavailable.

That’s it—run `pnpm test` before you push to catch regressions early.
