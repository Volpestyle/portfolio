# Environment Configuration

This document covers environment setup across development, staging, and production.

## Environment Files

| File | Purpose | Git Tracked |
|------|---------|-------------|
| `.env.local` | Local development | No |
| `.env.development` | Development environment | No |
| `.env.staging` | Staging environment | No |
| `.env.production` | Production environment | No |
| `.env.test` | Test configuration | No |
| `.env.example` | Template | Yes |

## Syncing Environments

### To GitHub

```bash
# Sync local to GitHub dev environment
pnpm sync:local

# Sync development environment
pnpm sync:dev

# Sync staging environment
pnpm sync:staging

# Sync production to GitHub + AWS
pnpm sync:prod
```

### To AWS Secrets Manager

Production secrets are synced to AWS:

```bash
pnpm sync:prod:aws
```

This updates the Secrets Manager secrets referenced by the CDK stack.

## GitHub Environments

### Setting Up Environments

1. Go to Settings > Environments
2. Create environments: `production`, `staging`, `development`
3. Add environment variables and secrets

### Environment Variables (Vars)

Non-sensitive configuration:

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_REGION` | Deployment region | `us-east-1` |
| `APP_DOMAIN_NAME` | Primary domain | `example.com` |
| `APP_HOSTED_ZONE_DOMAIN` | Route53 zone | `example.com` |
| `NEXT_PUBLIC_SITE_URL` | Public URL | `https://example.com` |
| `PORTFOLIO_GIST_ID` | GitHub gist ID | `abc123...` |
| `ADMIN_EMAILS` | Admin email list | `admin@example.com` |
| `CDK_DEPLOY_ROLE_ARN` | IAM role ARN | `arn:aws:iam::...` |

### Secrets

Sensitive values:

| Secret | Description |
|--------|-------------|
| `GH_TOKEN` | GitHub PAT |
| `GH_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `NEXTAUTH_SECRET` | Session secret |
| `REVALIDATE_SECRET` | ISR secret |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth |
| `OPENAI_API_KEY` | OpenAI key |

## AWS Secrets Manager

### Secret Structure

Two secrets are used:

**Environment Secret** (`portfolio/env/{stage}`):
```json
{
  "OPENAI_API_KEY": "sk-...",
  "REVALIDATE_SECRET": "...",
  "NEXTAUTH_SECRET": "...",
  "GH_CLIENT_SECRET": "...",
  "GOOGLE_CLIENT_SECRET": "...",
  "UPSTASH_REDIS_REST_TOKEN": "..."
}
```

**Repository Secret** (`portfolio/repo`):
```json
{
  "GH_TOKEN": "ghp_...",
  "ADMIN_EMAILS": "admin@example.com"
}
```

### Secret References

In CDK configuration:

```typescript
// Environment variables
SECRETS_MANAGER_ENV_SECRET_ID=portfolio/env/production
SECRETS_MANAGER_REPO_SECRET_ID=portfolio/repo
```

### Secret Injection

Secrets are injected at runtime:

1. CloudFront passes secret IDs via origin headers
2. Lambda@Edge wrapper reads headers
3. Fetches secrets from Secrets Manager
4. Injects into `process.env`

## First Deploy (Bootstrap)

For initial deployment without existing resources:

```bash
# Use fixture mode for first deploy
ALLOW_TEST_FIXTURES_IN_PROD=true BLOG_TEST_FIXTURES=true PORTFOLIO_TEST_FIXTURES=true pnpm build
cd infra/cdk && pnpm deploy
```

After first deploy:
1. Create Secrets Manager secrets
2. Update GitHub environment variables
3. Redeploy without fixtures
4. Remove `ALLOW_TEST_FIXTURES_IN_PROD` and the fixture flags once real data stores exist

## Environment-Specific Configuration

### Production

```bash
# .env.production
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://example.com
APP_DOMAIN_NAME=example.com
OPENAI_COST_METRICS_ENABLED=true
```

### Staging

```bash
# .env.staging
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://staging.example.com
APP_DOMAIN_NAME=staging.example.com
```

### Development

```bash
# .env.local
NODE_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
BLOG_TEST_FIXTURES=true
PORTFOLIO_TEST_FIXTURES=true
ENABLE_DEV_RATE_LIMIT=false
```

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `BLOG_TEST_FIXTURES` | `false` | Use mock blog data |
| `PORTFOLIO_TEST_FIXTURES` | `false` | Use mock portfolio data |
| `ENABLE_DEV_RATE_LIMIT` | `false` | Enable rate limiting in dev |
| `OPENAI_COST_METRICS_ENABLED` | `false` | Publish cost metrics |

## Validating Configuration

Before deployment, validate stack configuration:

```bash
cd infra/cdk
pnpm validate
```

This checks:
- Required environment variables present
- Secret references valid
- Domain configuration consistent

## Troubleshooting

### Missing Secrets

If Lambda fails with secret errors:

1. Check Secrets Manager secret exists
2. Verify secret ID matches environment variable
3. Confirm Lambda role has `secretsmanager:GetSecretValue` permission

### Domain Issues

If custom domain doesn't work:

1. Verify Route53 hosted zone exists
2. Check ACM certificate is in `us-east-1`
3. Confirm certificate covers all domain names

### Rate Limiting Issues

If rate limiting blocks requests:

1. Check Upstash Redis configuration
2. Verify `ENABLE_DEV_RATE_LIMIT` setting
3. Review rate limit configuration in code
