# Environment Variables

Complete reference for all environment variables used in the portfolio.

## Quick Reference

| Category | Variables |
|----------|-----------|
| Core | `NODE_ENV`, `NEXT_PUBLIC_SITE_URL` |
| Auth | `NEXTAUTH_*`, `GH_CLIENT_*`, `GOOGLE_CLIENT_*` |
| GitHub | `GH_TOKEN`, `PORTFOLIO_GIST_ID` |
| Chat | `OPENAI_API_KEY`, `CHAT_*` |
| AWS | `AWS_REGION`, `SECRETS_MANAGER_*` |
| Rate Limiting | `UPSTASH_*`, `ENABLE_DEV_RATE_LIMIT` |
| Testing | `*_TEST_FIXTURES`, `E2E_*` |

## Core Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `development`, `production` |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public URL | `https://example.com` |

## Authentication

### NextAuth.js

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_URL` | Yes | App URL for callbacks |
| `NEXTAUTH_SECRET` | Yes | Session encryption key (32+ chars) |
| `ADMIN_EMAILS` | No | Comma-separated admin emails |

### GitHub OAuth

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_CLIENT_ID` | No | GitHub OAuth client ID |
| `GH_CLIENT_SECRET` | No | GitHub OAuth client secret |

### Google OAuth

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |

## GitHub Integration

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_TOKEN` | Yes | GitHub Personal Access Token |
| `PORTFOLIO_GIST_ID` | Yes | ID of portfolio data gist |

## Chat System

### Core

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `CHAT_DEBUG_LEVEL` | No | Debug verbosity (0-3) |

### Cost Tracking

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_COST_METRICS_ENABLED` | No | Enable CloudWatch metrics |
| `OPENAI_COST_METRIC_NAMESPACE` | No | CloudWatch namespace |
| `OPENAI_COST_METRIC_NAME` | No | Metric name |
| `OPENAI_COST_ALERT_EMAIL` | No | Alert recipient email |

### Security

| Variable | Required | Description |
|----------|----------|-------------|
| `CHAT_ORIGIN_SECRET` | No | Origin validation secret |
| `REVALIDATE_SECRET` | Yes | ISR revalidation secret |

## AWS Configuration

### General

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | No | Default: `us-east-1` |

### Secrets Manager

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRETS_MANAGER_ENV_SECRET_ID` | No | Environment secret ID/ARN |
| `SECRETS_MANAGER_REPO_SECRET_ID` | No | Repository secret ID/ARN |
| `AWS_SECRETS_MANAGER_PRIMARY_REGION` | No | Primary secrets region |
| `AWS_SECRETS_MANAGER_FALLBACK_REGION` | No | Fallback region |

### DynamoDB (Set by CDK)

| Variable | Description |
|----------|-------------|
| `POSTS_TABLE` | Blog posts table name |
| `POSTS_STATUS_INDEX` | GSI for status queries |
| `COST_TABLE_NAME` | Chat cost tracking table |
| `CACHE_DYNAMO_TABLE` | ISR revalidation table |

### S3 (Set by CDK)

| Variable | Description |
|----------|-------------|
| `CONTENT_BUCKET` | Blog content bucket |
| `MEDIA_BUCKET` | Blog media bucket |
| `CACHE_BUCKET_NAME` | ISR cache bucket |
| `CACHE_BUCKET_KEY_PREFIX` | Cache key prefix |
| `CACHE_BUCKET_REGION` | Cache bucket region |

### Other AWS (Set by CDK)

| Variable | Description |
|----------|-------------|
| `REVALIDATION_QUEUE_URL` | SQS queue URL |
| `REVALIDATION_QUEUE_REGION` | Queue region |
| `BLOG_PUBLISH_FUNCTION_ARN` | Publish Lambda ARN |
| `SCHEDULER_ROLE_ARN` | EventBridge role ARN |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution |

## Rate Limiting

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash auth token |
| `ENABLE_DEV_RATE_LIMIT` | No | Enable in development |

## Domain Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_DOMAIN_NAME` | No | Primary domain |
| `APP_HOSTED_ZONE_DOMAIN` | No | Route53 zone |
| `APP_CERTIFICATE_ARN` | No | ACM certificate ARN |
| `APP_ALTERNATE_DOMAINS` | No | Additional domains |

## Testing

### Fixture Mode

| Variable | Description |
|----------|-------------|
| `BLOG_TEST_FIXTURES` | Use mock blog data |
| `PORTFOLIO_TEST_FIXTURES` | Use mock portfolio data |

### Playwright

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_SKIP_WEBSERVER` | Don't start dev server |
| `PLAYWRIGHT_TEST_BASE_URL` | Override test URL |
| `E2E_USE_REAL_APIS` | Use real APIs vs fixtures |
| `E2E_API_BASE_URL` | API base URL for tests |

## Preprocessing

| Variable | Description |
|----------|-------------|
| `CHAT_PREPROCESS_TASKS` | Comma-separated task list |

## Environment File Templates

### Development (.env.local)

```bash
# Core
NODE_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=development-secret-at-least-32-characters
ADMIN_EMAILS=your@email.com

# GitHub
GH_TOKEN=ghp_your_token
PORTFOLIO_GIST_ID=your_gist_id

# Chat
OPENAI_API_KEY=sk-your-key
CHAT_DEBUG_LEVEL=2

# Development shortcuts
BLOG_TEST_FIXTURES=true
PORTFOLIO_TEST_FIXTURES=true
ENABLE_DEV_RATE_LIMIT=false
```

### Production

```bash
# Core
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://example.com

# Auth (in Secrets Manager)
NEXTAUTH_URL=https://example.com
NEXTAUTH_SECRET=<secure-random-string>

# AWS
AWS_REGION=us-east-1
SECRETS_MANAGER_ENV_SECRET_ID=portfolio/env/production
SECRETS_MANAGER_REPO_SECRET_ID=portfolio/repo

# Cost monitoring
OPENAI_COST_METRICS_ENABLED=true
OPENAI_COST_ALERT_EMAIL=alerts@example.com
```

## Variable Precedence

1. Shell environment
2. `.env.local`
3. `.env.[environment].local`
4. `.env.[environment]`
5. `.env`

## Runtime Injection

In production, secrets are injected at runtime:

1. CDK passes secret IDs via CloudFront headers
2. Lambda@Edge reads headers on cold start
3. Secrets fetched from Secrets Manager
4. Injected into `process.env`

## Validation

CDK validates configuration before deployment:

```bash
cd infra/cdk
pnpm validate
```

This checks:
- Required variables present
- Secret references valid
- Configuration consistency
