# Portfolio

Live at [jcvolpe.me](https://jcvolpe.me)

A full-stack portfolio application built with Next.js 15, React 19, and deployed on AWS using OpenNext and CDK.

## Features

- **AI-Powered Chat**: RAG-based conversational interface with semantic search over portfolio content
- **Blog System**: Full CMS with DynamoDB storage, scheduled publishing, and admin dashboard
- **GitHub Projects**: Dynamic project showcase with documentation viewer from GitHub repos
- **Authentication**: NextAuth.js with GitHub/Google OAuth

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | Next.js 15, React 19, TailwindCSS, Framer Motion |
| Backend | Next.js API Routes, NextAuth.js, OpenAI API |
| Infrastructure | AWS CDK, Lambda@Edge, CloudFront, DynamoDB, S3 |
| Data | Upstash Redis, AWS Secrets Manager |
| Testing | Playwright (E2E), Chat Evals |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test
```

## Project Structure

```
/
├── src/                    # Next.js application source
│   ├── app/               # App Router pages and API routes
│   ├── components/        # React components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and helpers
│   ├── server/            # Server-side code
│   └── context/           # React context providers
├── packages/              # Monorepo packages
│   ├── chat-contract/     # Zod schemas for chat API
│   ├── chat-data/         # Data layer with MiniSearch
│   ├── chat-orchestrator/ # OpenAI integration
│   ├── chat-next-api/     # API route handlers
│   ├── chat-next-ui/      # Chat UI components
│   ├── chat-preprocess-cli/ # Data preprocessing CLI
│   ├── github-data/       # GitHub API integration
│   └── test-support/      # Test fixtures and utilities
├── infra/cdk/            # AWS CDK infrastructure
├── generated/            # Preprocessed chat embeddings
└── e2e/                  # Playwright E2E tests
```

## Documentation

Comprehensive documentation is available in the [docs/](docs/) folder:

- [Getting Started](docs/getting-started/) - Installation, development, and commands
- [Architecture](docs/architecture/) - System design and infrastructure
- [Features](docs/features/) - Chat, blog, projects, and authentication
- [Configuration](docs/configuration/) - Environment variables and secrets
- [Deployment](docs/deployment/) - CI/CD and production deployment
- [Testing](docs/testing/) - E2E testing and chat evaluations

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build for production (OpenNext + CDK) |
| `pnpm lint` | Run TypeScript and ESLint checks |
| `pnpm test` | Run Playwright E2E tests |
| `pnpm chat:preprocess` | Generate chat embeddings |
| `pnpm chat:evals` | Run chat quality evaluations |

## License

Private repository.
