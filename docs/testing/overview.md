# Testing Overview

This document covers the testing strategy and infrastructure for the portfolio.

## Testing Stack

| Type | Tool | Location |
|------|------|----------|
| E2E | Playwright | `e2e/` |
| Integration | Playwright | `e2e/` |
| Chat Evals | Custom | `scripts/chat-evals.ts` |
| Type Checking | TypeScript | `pnpm lint` |

## Test Categories

### E2E Tests

Full user flow testing with browser automation:

- `site-flows.spec.ts` - Navigation, page rendering
- `engagement.spec.ts` - User interactions

### Integration Tests

API-level testing without browser:

- `api-integration.spec.ts` - API endpoint validation

### Chat Evaluations

Quality testing for chat responses:

- Relevance scoring
- Response accuracy
- Retrieval quality

## Test Modes

### Fixture Mode

Uses mock data for deterministic, fast tests:

```bash
BLOG_TEST_FIXTURES=true PORTFOLIO_TEST_FIXTURES=true pnpm test
```

Benefits:
- No AWS calls required
- Consistent test data
- Fast execution
- Works offline

### Real API Mode

Tests against actual deployed infrastructure:

```bash
E2E_USE_REAL_APIS=true pnpm test:real-api
```

Use cases:
- Post-deploy smoke tests
- Integration validation
- Production verification

## Quick Start

### Run All Tests

```bash
pnpm test
```

### Visual Test Mode

```bash
pnpm test:ui
```

### Debug Tests

```bash
pnpm test:debug
```

## Test Infrastructure

### Fixture Data

Mock data in `@portfolio/test-support`:

```typescript
// Mock blog posts
import { BLOG_TEST_FIXTURES } from '@portfolio/test-support/fixtures';

// Mock portfolio data
import { PORTFOLIO_TEST_FIXTURES } from '@portfolio/test-support/fixtures';
```

### Test Boundaries

ESLint enforces test-support imports:

```bash
pnpm lint:test-boundaries
```

Only test files can import from `@portfolio/test-support`.

## CI/CD Integration

### Pull Request Tests

On every PR to `main`:
- Build verification
- E2E tests with fixtures
- Report artifact upload

### Post-Deploy Tests

After production deployment:
- API smoke tests
- UI smoke tests
- Real data validation

## Test Commands

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all E2E tests |
| `pnpm test:ui` | Visual test mode |
| `pnpm test:headed` | Show browser |
| `pnpm test:debug` | Debug mode |
| `pnpm test:real-api` | Real API tests |
| `pnpm test:real-ui` | Real UI tests |
| `pnpm chat:evals` | Chat quality tests |

## Related Documentation

- [E2E Testing](./e2e-testing.md) - Playwright details
- [Chat Evals](./chat-evals.md) - Chat quality testing
- [CI/CD](../deployment/ci-cd.md) - Test automation
