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
- **[Ask My Portfolio](docs/features/ask-my-portfolio.md)** – Interactive chat interface for exploring projects
- **[Chat Data Caching](docs/features/chat-data-caching.md)** – Caching strategy for chat interactions
- **[Language Enrichment](docs/features/language-enrichment.md)** – Enhanced language detection and display

### AI Integrations

AI and machine learning feature documentation:

- **[GPT-5 Nano Integration](docs/ai-integrations/gpt5-nano-integration.md)** – Integration guide for GPT-5 Nano capabilities

### Operations

Operational guides and troubleshooting resources:

- **[Log Diving](docs/operations/log-diving.md)** – Guide to finding and analyzing CloudWatch logs for Lambda functions

## About

Full-stack Next.js 15 portfolio with an AI-powered chat assistant, blog CMS, and GitHub project integration. Deployed to AWS using CDK and OpenNext.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Generate Project Knowledge

The AI chat requires precomputed embeddings. Set `GH_TOKEN`, `PORTFOLIO_GIST_ID`, and `OPENAI_API_KEY`, then run:

```bash
pnpm generate:projects
```

This generates `generated/repo-summaries.json` and `generated/repo-embeddings.json`. Commit these files.

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

GitHub Actions automatically deploys on `main` branch pushes. See [CDK Stack Guide](docs/architecture/cdk.md) for required secrets and environment variables.
