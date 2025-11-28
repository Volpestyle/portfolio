# Plan: Separate Test-Only Code From Production Bundles

## Objectives

- Keep deterministic fixtures and Playwright helpers available for tests while ensuring production builds never include or execute them.
- Prevent accidental shipping of mock data or fixture toggles via headers/env.
- Add guardrails so future imports of test-only modules into production code fail CI.

## Constraints / Existing State

- Fixtures and test-mode helpers lived under `src/` and were imported by API routes and server modules (`test-fixtures.ts`, `test-mode.ts`, blog mock store, chat fixture responses).
- Playwright config sets `BLOG_TEST_FIXTURES`/`PORTFOLIO_TEST_FIXTURES` and sends headers; `tsconfig` includes all source, so test files are type-checked with prod.
- No lint/CI boundary checks preventing prod entrypoints from pulling test-only modules.

## Progress
- [x] Created `@portfolio/test-support` package with fixtures, chat fixture response builder, and blog mock store (dynamic-only consumers).
- [x] Added runtime gating helper (`src/lib/test-flags.ts`) that fail-fast blocks fixture flags in production and requires explicit flags for test fixtures.
- [x] Refactored API routes, chat route, GitHub server, and blog store/config to use dynamic imports guarded by fixture flags.
- [x] Added ESLint restriction and `pnpm lint:test-boundaries` script to block static imports of test-support from production code.
- [ ] Add dependency-graph-style check beyond static import scan (optional).
- [ ] Finalize docs/runbooks and run verification matrix (lint/tests/build).

## Work Plan

1. **Define test-only module location**
   - Create a dedicated test support package (`packages/test-support`) to house fixtures, mock stores, and helpers. Mark it `devDependency` only.
   - Export typed fixtures (projects, blog posts, chat fixture trace) and utilities for Playwright headers there.

2. **Introduce explicit boundary contracts**
   - Add ESLint rule(s) or a custom lint config to forbid imports of `@/lib/test-*`, `@/server/blog/mock-store`, or the new test-support package from production entrypoints (`src/app`, `src/server`, `src/lib`, `packages/*` runtime code). Allowlist `e2e/**`, `tests/**`, and the test-support package itself.
   - Add a lint target (e.g., `pnpm lint:test-boundaries`) and wire into CI.

3. **Refactor fixtures out of production paths**
   - Move `src/lib/test-fixtures.ts` and `src/lib/test-mode.ts` into the test-support module. Replace production imports with guarded dynamic imports that only run in non-production test modes.
   - Ensure `chat` route, GitHub routes, and blog APIs no longer statically import fixtures.

4. **Harden runtime gating for mocks**
   - Require explicit environment flags (e.g., `ALLOW_TEST_FIXTURES=true`) in non-production builds; ignore headers entirely in production. Fail fast if a fixture flag is detected in production.
   - Centralize flag evaluation in a small runtime-only helper (in prod code) that exposes booleans; the helper must not import fixtures.

5. **Blog store separation**
   - Move `src/server/blog/mock-store.ts` into test-support.
   - In `blog/store.ts`, replace `isBlogFixtureRuntime()` branching with: early prod guard (throw if fixture flag set), otherwise conditionally `await import('@portfolio/test-support/mock-blog-store')` when the flag is on. Default path uses AWS clients.
   - Ensure `blog/config.ts` no longer falls back to mock resource names in production; only allow mock defaults when fixture flag is enabled in non-prod.

6. **GitHub data separation**
   - Extract SSR fixture handling from `github-server.ts` into a test-support dynamic import. If fixture flag is set outside production, dynamically load fixtures; otherwise, proceed with real GitHub fetches.
   - Add an invariant so production cannot start with fixture flags set.

7. **Chat fixture streaming isolation**
   - Move chat fixture response builder into test-support. In `api/chat/route.ts`, gate fixture path behind dynamic import when test mode is active; keep default path real. Ensure bundling drops fixtures in prod.

8. **TypeScript path updates**
   - Update `tsconfig` paths and package exports for the new test-support module. Consider excluding `e2e/**` and test-support from production type-check in CI build (or run separate `tsc` for prod vs tests).

9. **CI enforcement**
   - Add a graph check (e.g., dependency-cruiser or a small script) that fails if production folders import from test-support or `e2e/**`.
   - Integrate into CI alongside ESLint.

10. **Docs and runbooks**

- Update `e2e/README.md` and `docs/operations` to document fixture usage, flags, and the new boundary rules. Include guidance for adding new fixtures and how to run tests locally.

11. **Verification steps**

- Run lint + boundary checks, `pnpm test` (fixtures path), and `pnpm test:real-api` (real path) to confirm both modes still work.
- Build (`pnpm build:web`) and confirm fixture modules are tree-shaken out (check bundle/analyze or size diff).
- Confirm production env with fixture flags set fails fast at startup.

## Definition of Done

- No production entrypoint statically imports test fixtures or mock stores.
- Fixture flags cannot alter behavior in production; attempts fail loudly.
- ESLint/CI boundary checks prevent regressions.
- Playwright and integration test flows still operate with deterministic fixtures and real modes respectively.
