# @portfolio/test-support

Test fixtures and utilities for E2E and integration testing.

## Overview

This package provides testing infrastructure:

- Mock data fixtures for blog and portfolio
- Test utilities and helpers
- Fixture-based API responses

## Dependencies

- `@portfolio/chat-contract` - Type definitions
- `@portfolio/chat-next-api` - API handler types

## Exports

```typescript
// Main test utilities
import { ... } from '@portfolio/test-support';

// Mock fixtures
import { BLOG_TEST_FIXTURES, PORTFOLIO_TEST_FIXTURES } from '@portfolio/test-support/fixtures';

// Chat fixture responses
import { createFixtureResponse } from '@portfolio/test-support/chat/fixture-response';

// Blog mock store
import { createMockBlogStore } from '@portfolio/test-support/blog/mock-store';
```

## Fixture Mode

Enable fixtures via environment variables:

```bash
# Use mock blog data
BLOG_TEST_FIXTURES=true

# Use mock portfolio data
PORTFOLIO_TEST_FIXTURES=true
```

## ESLint Boundary

This package is restricted from production imports. ESLint enforces that `@portfolio/test-support` can only be imported in:

- `e2e/` directory
- Test files (`*.test.ts`, `*.spec.ts`)
- Other test-support code

## Usage

### E2E Tests

```typescript
// e2e/site-flows.spec.ts
import { BLOG_TEST_FIXTURES } from '@portfolio/test-support/fixtures';

test('blog post displays correctly', async ({ page }) => {
  const testPost = BLOG_TEST_FIXTURES.posts[0];
  await page.goto(`/blog/${testPost.slug}`);
  await expect(page.locator('h1')).toContainText(testPost.title);
});
```

### API Integration Tests

```typescript
// Real API tests bypass fixtures
process.env.BLOG_TEST_FIXTURES = undefined;
process.env.PORTFOLIO_TEST_FIXTURES = undefined;
```

## Related Packages

- [@portfolio/chat-contract](../chat-contract/) - Fixture types
- [@portfolio/chat-next-api](../chat-next-api/) - API mocking
