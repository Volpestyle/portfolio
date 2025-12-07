# Architecture Overview

This document provides a high-level overview of the portfolio application architecture.

## System Diagram

![System Overview](../assets/diagrams/system-overview.png)

## Core Components

### Frontend (Next.js 15)

- **App Router** - File-based routing with React Server Components
- **React 19** - Latest React features including Server Actions
- **TailwindCSS** - Utility-first styling
- **Framer Motion** - Animations and transitions

### Backend (AWS Lambda)

- **Lambda@Edge** - Next.js SSR at edge locations
- **Regional Lambda** - Chat streaming with Function URLs
- **API Routes** - RESTful endpoints for data access

### Data Layer

- **DynamoDB** - Blog posts, ISR cache, chat cost tracking
- **S3** - Static assets, blog content, media files
- **Secrets Manager** - Runtime secrets (API keys, OAuth secrets)
- **Upstash Redis** - Rate limiting

### Observability

- **CloudWatch Metrics** - OpenAI cost tracking
- **CloudWatch Alarms** - Budget alerts via SNS
- **Structured Logging** - Lambda log groups

## Request Flow

### Page Request

1. User requests `/blog/my-post`
2. CloudFront receives request
3. Lambda@Edge executes SSR
4. DynamoDB queried for post data
5. React components render
6. HTML returned through CloudFront

### Chat Request

1. User sends chat message
2. CloudFront routes to chat Lambda
3. Lambda validates request
4. OpenAI API called with streaming
5. Response streamed back through Function URL

### Static Asset

1. User requests `/_next/static/chunk.js`
2. CloudFront checks cache
3. If miss, fetches from S3
4. Cached at edge for future requests

## Monorepo Structure

```
/
├── src/                    # Next.js application
│   ├── app/               # App Router routes
│   ├── components/        # React components
│   └── lib/               # Utilities
├── packages/              # Shared packages
│   ├── chat-*            # Chat system packages
│   ├── github-data/      # GitHub integration
│   └── test-support/     # Testing utilities
├── infra/cdk/            # AWS infrastructure
└── generated/            # Preprocessed data
```

## Key Design Decisions

### OpenNext for AWS

Uses OpenNext to compile Next.js for AWS Lambda instead of Vercel:
- Full control over infrastructure
- Cost optimization
- Custom Lambda configurations
- ISR with DynamoDB/S3 cache

### Lambda@Edge vs Regional

- **Lambda@Edge**: SSR pages for low latency
- **Regional Lambda**: Chat streaming (requires Function URL streaming)

### Monorepo with pnpm

- Shared code between packages
- TypeScript source imports (no build step for most packages)
- Workspace protocol for internal dependencies

## Related Documentation

- [Infrastructure](./infrastructure.md) - AWS resources in detail
- [OpenNext Configuration](./open-next.md) - OpenNext setup
- [Packages](./packages.md) - Monorepo package structure
