# OpenNext Configuration

OpenNext compiles Next.js for deployment on AWS Lambda. This document covers the configuration and build process.

## Overview

OpenNext transforms Next.js output for AWS:

- Lambda functions for SSR and API routes
- S3 for static assets
- DynamoDB/S3 for ISR cache
- CloudFront for CDN

## Configuration File

`open-next.config.ts`:

```typescript
import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';

const config: OpenNextConfig = {
  default: {
    override: {
      tagCache: 'dynamodb-lite',
      incrementalCache: 's3-lite',
      queue: 'sqs-lite',
    },
  },
  functions: {
    chat: {
      patterns: ['/api/chat', '/api/chat/*'],
      override: {
        wrapper: 'aws-lambda-streaming',
      },
    },
  },
};

export default config;
```

## Build Process

```bash
pnpm build:web
# or
pnpm dlx @opennextjs/aws@latest build
```

### Output Structure

```
.open-next/
├── open-next.output.json     # Build manifest
├── server-function/          # Lambda@Edge server
│   ├── index.mjs
│   └── node_modules/
├── image-optimization-function/
│   ├── index.mjs
│   └── sharp/               # Native image processing
├── cache/
│   └── __fetch/            # Data cache
├── dynamodb-provider/       # Cache initialization
├── revalidation-function/   # ISR worker
└── assets/                  # Static files
    ├── _next/
    │   ├── static/         # Immutable chunks
    │   └── data/           # Route data
    └── ...                 # Public files
```

## Cache Configuration

### Incremental Cache (S3)

ISR page cache stored in S3:

```
s3://assets-bucket/_cache/
├── __fetch/                 # Data cache
└── pages/                   # Page cache
```

### Tag Cache (DynamoDB)

Maps cache tags to paths for revalidation:

| tag | path | revalidatedAt |
|-----|------|---------------|
| `posts` | `/blog` | 1699999999 |
| `post:my-slug` | `/blog/my-slug` | 1699999999 |

### Revalidation Queue (SQS)

FIFO queue for processing revalidation requests:

```json
{
  "tag": "posts",
  "paths": ["/blog", "/api/posts"]
}
```

## Function Configuration

### Default (Lambda@Edge)

All routes except explicit overrides:

- ISR pages
- API routes
- Dynamic routes

### Chat Function

Separate regional Lambda with streaming:

```typescript
functions: {
  chat: {
    patterns: ['/api/chat', '/api/chat/*'],
    override: {
      wrapper: 'aws-lambda-streaming',
    },
  },
}
```

Required because:
- Lambda@Edge doesn't support streaming
- Function URLs enable response streaming
- Regional deployment allows longer timeouts

## Next.js Configuration

`next.config.mjs` settings for OpenNext:

```javascript
const nextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/**': [
      './generated/**/*',
      './chat.config.yml',
      './node_modules/react/**/*',
      './node_modules/react-dom/**/*',
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};
```

### Output Tracing

Files included in Lambda bundles:

- `generated/` - Chat embeddings
- `chat.config.yml` - Chat configuration
- React runtime for Server Components

## Environment Variables

At build time:

```bash
# GitHub data for static generation
GH_TOKEN=...
PORTFOLIO_GIST_ID=...

# AWS resources (if available)
POSTS_TABLE=...
CONTENT_BUCKET=...
```

At runtime (via Secrets Manager or origin headers):

```bash
OPENAI_API_KEY=...
NEXTAUTH_SECRET=...
# ... other secrets
```

## CDK Integration

The CDK stack reads `open-next.output.json`:

```typescript
const openNextOutput = JSON.parse(
  fs.readFileSync('.open-next/open-next.output.json', 'utf-8')
);

// Create Lambda functions from output
for (const [name, config] of Object.entries(openNextOutput.origins)) {
  if (config.type === 'function') {
    createLambdaFunction(name, config);
  }
}

// Configure CloudFront behaviors
for (const behavior of openNextOutput.behaviors) {
  createBehavior(behavior);
}
```

## Troubleshooting

### Build Fails with Missing Modules

Ensure all dependencies are properly traced:

```javascript
// next.config.mjs
outputFileTracingIncludes: {
  '/api/**': ['./node_modules/some-package/**/*'],
}
```

### Lambda Bundle Too Large

Check bundle size and optimize:

```bash
du -sh .open-next/server-function/
```

Solutions:
- Exclude dev dependencies
- Use dynamic imports
- Check for duplicate modules

### ISR Not Working

Verify cache configuration:

1. Check DynamoDB tag cache table exists
2. Verify S3 cache bucket permissions
3. Check revalidation queue is processing

## Related Documentation

- [Infrastructure](./infrastructure.md) - AWS resources
- [Deployment](../deployment/overview.md) - Deploy process
