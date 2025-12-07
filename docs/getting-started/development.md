# Development Guide

This guide covers the day-to-day development workflow for the portfolio project.

## Development Server

Start the development server with Turbopack for fast refresh:

```bash
pnpm dev
```

The server runs at `http://localhost:3000` with:
- Hot Module Replacement (HMR)
- Fast Refresh for React components
- TypeScript type checking
- Automatic route reloading

## Code Quality

### Type Checking

Run TypeScript compiler without emitting:

```bash
pnpm lint
```

This runs both `tsc --noEmit` and ESLint.

### Formatting

Format all files with Prettier:

```bash
pnpm format
```

Configuration:
- 120 character line width
- Tailwind CSS class sorting (via plugin)
- Single quotes

## Working with Packages

The monorepo uses pnpm workspaces. Each package in `packages/` is independently versioned.

### Package Dependencies

Internal packages use workspace protocol:

```json
{
  "dependencies": {
    "@portfolio/chat-contract": "workspace:*"
  }
}
```

### Building Packages

Most packages use TypeScript source directly (`main: ./src/index.ts`). The exception is `@portfolio/chat-preprocess-cli` which requires compilation:

```bash
pnpm --filter @portfolio/chat-preprocess-cli run build
```

## Testing Locally

### E2E Tests with UI

```bash
pnpm test:ui
```

Opens Playwright's visual test runner.

### Headed Browser Tests

```bash
pnpm test:headed
```

Runs tests with visible browser windows.

### Debug Mode

```bash
pnpm test:debug
```

Enables Playwright inspector for step-through debugging.

## Chat Development

### Preprocessing Data

Generate embeddings for the chat system:

```bash
pnpm chat:preprocess
```

Requires `OPENAI_API_KEY` and `PORTFOLIO_GIST_ID`.

### Running Evaluations

Test chat quality with evaluation suite:

```bash
pnpm chat:evals
```

Uses fixtures from `.env.test`.

## Blog Development

### Fixture Mode

For blog development without AWS:

```bash
BLOG_TEST_FIXTURES=true pnpm dev
```

Uses mock data from `@portfolio/test-support/fixtures`.

### Real Data

Remove fixture flags to use actual DynamoDB data:

```bash
# Ensure AWS credentials are configured
aws configure

# Start with real data
pnpm dev
```

## Debugging

### React Query DevTools

React Query devtools are automatically available in development mode.

### Chat Debug Mode

Enable verbose chat logging:

```bash
# In .env.local
CHAT_DEBUG_LEVEL=3
```

Levels:
- `0` - Disabled
- `1` - Basic logging
- `2` - Verbose
- `3` - Full debug output

### Next.js Debugging

```bash
NODE_OPTIONS='--inspect' pnpm dev
```

Attach VS Code debugger to `localhost:9229`.

## Common Issues

### TypeScript Errors After Package Changes

```bash
# Restart TS server in VS Code
Cmd+Shift+P > "TypeScript: Restart TS Server"
```

### Module Resolution Issues

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

## IDE Setup

### VS Code

Recommended extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (for better TS support)

### Workspace Settings

The project includes `.vscode/settings.json` for consistent formatting.

## Next Steps

- [Commands Reference](./commands.md) - All available scripts
- [Testing Guide](../testing/overview.md) - Testing strategies
- [Architecture](../architecture/overview.md) - System design
