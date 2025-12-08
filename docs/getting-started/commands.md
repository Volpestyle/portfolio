# Commands Reference

Complete reference for all available npm scripts in the portfolio project.

## Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm start` | Start production server (requires build) |

## Build

| Command | Description |
|---------|-------------|
| `pnpm build` | Full production build (OpenNext + CDK) |
| `pnpm build:web` | Build Next.js with OpenNext only |

The build process:
1. Compiles Next.js application
2. Transforms output for AWS Lambda via OpenNext
3. Generates `.open-next/` directory
4. Builds CDK infrastructure code

## Code Quality

| Command | Description |
|---------|-------------|
| `pnpm lint` | Run TypeScript + ESLint checks |
| `pnpm format` | Format code with Prettier |
| `pnpm lint:test-boundaries` | Check test import restrictions |

## Testing

### Playwright E2E Tests

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all E2E tests |
| `pnpm test:ui` | Open Playwright UI mode |
| `pnpm test:headed` | Run with visible browser |
| `pnpm test:debug` | Run with Playwright inspector |
| `pnpm test:report` | Show last test report |

### Real API Tests

| Command | Description |
|---------|-------------|
| `pnpm test:real-api` | API tests against deployed app |
| `pnpm test:real-api:dev` | API tests with local webserver |
| `pnpm test:real-ui` | UI tests against deployed app |
| `pnpm test:real-ui:dev` | UI tests with local webserver |
| `pnpm test:real-ui:dev:headed` | UI tests with visible browser |

### Integration Tests

| Command | Description |
|---------|-------------|
| `pnpm test:projectSearch` | Project search integration test |

## Chat System

| Command | Description |
|---------|-------------|
| `pnpm chat:preprocess` | Generate chat embeddings |
| `pnpm chat:preprocess:profile` | Preprocess profile/persona only |
| `pnpm chat:evals` | Run chat quality evaluations |
| `pnpm chat:evals:refresh-fixtures` | Update evaluation fixtures |

### Preprocessing Tasks

Control which tasks run:

```bash
CHAT_PREPROCESS_TASKS='profile,persona' pnpm chat:preprocess
```

Available tasks:
- `profile` - Portfolio profile
- `persona` - AI persona
- `projects` - Project embeddings
- `resume` - Resume embeddings

## Environment Sync

| Command | Description |
|---------|-------------|
| `pnpm sync:local` | Sync .env.local to GitHub (dev) |
| `pnpm sync:dev` | Sync .env.development to GitHub |
| `pnpm sync:staging` | Sync .env.staging to GitHub |
| `pnpm sync:prod` | Sync production to GitHub + AWS |
| `pnpm sync:prod:github` | Sync production to GitHub only |
| `pnpm sync:prod:aws` | Sync production to AWS only |

## Utilities

| Command | Description |
|---------|-------------|
| `pnpm generate:mermaid` | Generate Mermaid diagrams |
| `pnpm clean:docs` | Remove all README.md and docs/ |
| `pnpm export:chat:unified` | Export chat core functionality |

## CDK Commands

Run from `infra/cdk/` directory:

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile CDK TypeScript |
| `pnpm validate` | Validate stack configuration |
| `pnpm synth` | Synthesize CloudFormation |
| `pnpm deploy` | Deploy to AWS |
| `pnpm diff` | Show changes vs deployed |
| `pnpm destroy` | Destroy stack |

## Environment Variables

### Test Mode Flags

```bash
# Use mock blog data
BLOG_TEST_FIXTURES=true pnpm dev

# Use mock portfolio data
PORTFOLIO_TEST_FIXTURES=true pnpm dev
```

### Playwright Configuration

```bash
# Skip starting webserver
PLAYWRIGHT_SKIP_WEBSERVER=true pnpm test

# Use real APIs
E2E_USE_REAL_APIS=true pnpm test

# Custom base URL
PLAYWRIGHT_TEST_BASE_URL=https://example.com pnpm test
```

## CI/CD Scripts

These run automatically in GitHub Actions:

```bash
# Pre-deploy tests (with fixtures)
BLOG_TEST_FIXTURES=true PORTFOLIO_TEST_FIXTURES=true pnpm test

# Post-deploy smoke tests
PLAYWRIGHT_SKIP_WEBSERVER=true E2E_USE_REAL_APIS=true pnpm test:real-api
```

## Examples

### Full Development Workflow

```bash
# Install dependencies
pnpm install

# Generate chat data
pnpm chat:preprocess

# Start development
pnpm dev

# Run tests before commit
pnpm lint && pnpm test
```

### Production Build and Test

```bash
# Full build
pnpm build

# Test the build locally
pnpm start

# Deploy (from infra/cdk)
cd infra/cdk && pnpm deploy
```
