# My portfolio website

Live at [jcvolpe.me](https://jcvolpe.me).

## Documentation

Comprehensive technical documentation is organized in the [`docs/`](docs/) folder by theme:

### Architecture

High-level infrastructure design and deployment guides:

- **[Infrastructure Overview](docs/architecture/infra.md)** – Visual stack diagram and key components overview
- **[CDK Stack Guide](docs/architecture/cdk.md)** – Deep dive on the AWS CDK stack, deployment workflows, and operations
- **[OpenNext Integration](docs/architecture/opennext.md)** – How we deploy Next.js 15 to AWS using OpenNext artifacts

### Features

Documentation for major product features:

- **[Blog CMS](docs/features/blog.md)** – Blog content management system design using Auth.js, DynamoDB, and S3
- **[Admin UI](docs/features/admin-ui.md)** – Admin interface for blog management at `/admin`
- **[Stickfigure City](docs/features/stickfigure-city.md)** – Pixel art city generator

#### Chat System

The AI-powered "Ask My Portfolio" chat experience:

- **[Chat Specification](docs/features/chat/chat-spec.md)** – End-to-end spec for the chat pipeline, prompts, and UI contract
- **[Configuration Notes](docs/features/chat/config-notes.md)** – Model config, token limits, retrieval caps, and semantic ranking settings
- **[Chat Logging & Visibility](docs/features/chat/chat-logging.md)** – Debug levels, structured events, CloudWatch integration, and local export tools
- **[Rate Limits & Cost Guardrails](docs/features/chat/rate-limits-and-cost-guards.md)** – Upstash rate limiting (fail-closed) and OpenAI cost tracking with 30-day alarms

Chat models must be set in `chat.config.yml` (planner/answer); the embedding model defaults from `chat-preprocess.config.yml` unless you override it in `chat.config.yml`. The runtime will error at startup if any required model is missing after those fallbacks.

### Operations

Operational guides and troubleshooting resources:

- **[Log Diving](docs/operations/log-diving.md)** – Guide to finding and analyzing CloudWatch logs for Lambda functions

## About

Full-stack Next.js 15 portfolio with an AI-powered chat assistant, blog CMS, and GitHub project integration. Built as a TypeScript monorepo with domain-isolated packages. Deployed to AWS using CDK and OpenNext.

## Monorepo Structure

This workspace uses pnpm workspaces to organize domain logic into focused packages:

### Core Application

- **`src/`** – Next.js 15 App Router application (pages, API routes, components, hooks, server actions)
- **`infra/cdk/`** – AWS CDK infrastructure stack (CloudFront, Lambda@Edge, DynamoDB, S3, alarms)

### Chat Packages

- **`@portfolio/chat-contract`** – Shared TypeScript types and schemas for chat API contracts
- **`@portfolio/chat-data`** – Data access layer: project/resume/profile repositories, BM25 + semantic search
- **`@portfolio/chat-next-api`** – Server-side chat API: streaming SSE, embeddings, cost metrics, debug logging
- **`@portfolio/chat-next-ui`** – React components and hooks: `ChatProvider`, `useChat`, streaming state management
- **`@portfolio/chat-orchestrator`** – Core chat pipeline: planner → retrieval → answer with prompt templates
- **`@portfolio/chat-preprocess-cli`** – CLI for preprocessing chat data (project knowledge, resume parsing, embeddings)

### Utilities

- **`@portfolio/github-data`** – GitHub API integration for fetching repository metadata

All packages are built with TypeScript and share a common `tsconfig.json` base. See individual package READMEs for usage details:

- [`packages/chat-preprocess-cli/README.md`](packages/chat-preprocess-cli/README.md)
- [`packages/chat-next-ui/README.md`](packages/chat-next-ui/README.md)

## Quick Start

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Chat Data Preprocess

The AI chat experience relies on precomputed repo knowledge, resume data, and profile metadata. Set `GH_TOKEN`, `PORTFOLIO_GIST_ID`, and `OPENAI_API_KEY`, then run:

```bash
pnpm chat:preprocess
```

This orchestrates every ingestion step (project summaries + embeddings, resume parser, profile builder) and writes refreshed artifacts to `generated/` (`projects.json`, `projects-embeddings.json`, `resume.json`, `resume-embeddings.json`, `profile.json`).
Inputs you need in the repo: `data/chat/profile.json` and a resume PDF at `public/resume/` (defaults to `resume.filename` in `chat-preprocess.config.yml`, falling back to `resume.pdf` when omitted). The raw resume JSON now defaults to `generated/resume-raw.json` and is produced from the PDF, so you don't need to check in `data/chat/resume.json` unless you want to supply a handcrafted source via `paths.resumeJson`. Persona output is now static and comes directly from `profile.json` fields (`systemPersona`, first three `about` entries for `shortAbout`, `styleGuidelines`, `voiceExamples`).

## Ask My Portfolio (Chat)

The chat experience runs on a multi-stage orchestrator pipeline:

- **Planner → Retrieval → Answer** pipeline in `packages/chat-orchestrator`; UI cards come from `AnswerPayload.uiHints`, never directly from retrieval.
- **Retrieval** is in-process BM25 + embeddings over the precomputed snapshots in `generated/` (projects, resume, profile) loaded via `src/server/chat/dataProviders.ts`; no external vector DB.
- **Streaming** via `/api/chat` route emits SSE events (`stage`, `reasoning`, `ui`, `token`, `item`, `attachment`, `ui_actions`, `done`, `error`) using `@portfolio/chat-next-api`; the front-end consumes them through `ChatProvider` from `@portfolio/chat-next-ui`.
- **Answer payload** is structured JSON: the Answer stage streams `AnswerPayload.message` tokens and also returns optional `thoughts` for dev-only reasoning.
- **Configuration** supports model overrides, token limits, semantic ranking weights, and debug levels (see [config-notes.md](docs/features/chat/config-notes.md)).
- **Observability** includes structured logging with correlation IDs, CloudWatch integration, cost metrics, and local debug export (see [chat-logging.md](docs/features/chat/chat-logging.md)).
- **Safety** enforces rate limits (5/min, 40/hr, 120/day) that fail-closed and a $10/month runtime cost alarm with warning/critical/exceeded thresholds for planner/answer + embedding calls (see [rate-limits-and-cost-guards.md](docs/features/chat/rate-limits-and-cost-guards.md)).

Detailed prompts, JSON schemas, and UI contract examples live in [docs/features/chat/chat-spec.md](docs/features/chat/chat-spec.md).

## Testing

The test suite uses Playwright for both E2E behavioral tests and integration tests against real services.

### Quick Commands

```bash
# Run E2E tests (fast, deterministic fixtures)
pnpm test

# Run integration tests (real AWS/GitHub/OpenAI)
pnpm test:real-api

# Interactive development
pnpm test:ui

# View test report
pnpm test:report
```

### Test Architecture

- **E2E Tests** (`site-flows.spec.ts`, `engagement.spec.ts`) – Fast, fixture-based tests for UI behavior
- **Integration Tests** (`api-integration.spec.ts`) – Real service verification (costs money, sends real emails)
- **Unified Testing** – Same Playwright setup supports both modes via `E2E_USE_REAL_APIS` flag

See [e2e/README.md](e2e/README.md) for complete testing guide, authoring guidelines, and CI/CD integration details.

## Scripts & Tools

### Environment Sync

Keep GitHub environments and AWS Secrets Manager aligned with annotated `.env.*` files:

```bash
# Sync local dev environment
pnpm sync:local

# Sync production (GitHub + AWS)
pnpm sync:prod
```

See [scripts/README.md](scripts/README.md) for complete documentation on environment sync, chat evaluation tools, and export utilities.

### Chat Data Preprocessing

Generate embeddings and knowledge artifacts for the chat system:

```bash
# Full preprocessing pipeline
pnpm chat:preprocess

# Profile generation only
pnpm chat:preprocess:profile

# Run chat evaluations
pnpm chat:evals
```

See [`packages/chat-preprocess-cli/README.md`](packages/chat-preprocess-cli/README.md) for configuration options.

## Deployment

The site deploys to AWS using CDK and OpenNext. See the [CDK Stack Guide](docs/architecture/cdk.md) for full deployment instructions.

### Quick Deploy

```bash
# Build Next.js artifacts
pnpm run build:web

# Deploy to AWS (must be us-east-1 for Lambda@Edge)
cd infra/cdk
export CDK_DEFAULT_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=<your-account-id>
pnpm cdk deploy
```

### CI/CD

GitHub Actions automatically deploys on `main` branch pushes:

1. **Pre-deployment**: E2E tests with fixtures (fast safety check)
2. **Deploy**: CDK stack to AWS
3. **Post-deployment**: Integration tests with real services

See [CDK Stack Guide](docs/architecture/cdk.md) for required secrets and environment variables.
