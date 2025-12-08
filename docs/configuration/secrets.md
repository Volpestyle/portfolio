# Secrets Management

This document covers how secrets are managed across development and production environments.

## Overview

Secrets are handled differently by environment:

| Environment | Storage | Access |
|-------------|---------|--------|
| Development | `.env.local` | Direct file read |
| CI/CD | GitHub Secrets | Workflow injection |
| Production | AWS Secrets Manager | Runtime fetch |

## Development Secrets

### Local Configuration

Store secrets in `.env.local` (gitignored):

```bash
# .env.local
OPENAI_API_KEY=sk-your-key
NEXTAUTH_SECRET=development-secret-min-32-chars
GH_CLIENT_SECRET=your-github-oauth-secret
```

### Required Secrets

| Secret | Description | How to Get |
|--------|-------------|------------|
| `NEXTAUTH_SECRET` | Session encryption | `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenAI API access | OpenAI dashboard |
| `GH_TOKEN` | GitHub API access | GitHub settings |

### Optional Secrets

| Secret | Description |
|--------|-------------|
| `GH_CLIENT_SECRET` | GitHub OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |

## GitHub Secrets

### Repository Secrets

Configure in Settings > Secrets and variables > Actions:

| Secret | Description |
|--------|-------------|
| `GH_TOKEN` | GitHub PAT for API access |
| `GH_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `NEXTAUTH_SECRET` | Auth session secret |
| `REVALIDATE_SECRET` | ISR revalidation |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth |

### Environment Secrets

Different secrets per environment (production, staging):

```yaml
# .github/workflows/deploy.yml
env:
  NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
  GH_CLIENT_SECRET: ${{ secrets.GH_CLIENT_SECRET }}
```

## AWS Secrets Manager

### Secret Structure

Two secrets are used in production:

**Environment Secret** (`portfolio/env/{stage}`):

Contains per-environment secrets:

```json
{
  "OPENAI_API_KEY": "sk-...",
  "REVALIDATE_SECRET": "...",
  "NEXTAUTH_SECRET": "...",
  "GH_CLIENT_SECRET": "...",
  "GOOGLE_CLIENT_SECRET": "...",
  "UPSTASH_REDIS_REST_TOKEN": "...",
  "CHAT_ORIGIN_SECRET": "..."
}
```

**Repository Secret** (`portfolio/repo`):

Contains cross-environment secrets:

```json
{
  "GH_TOKEN": "ghp_...",
  "ADMIN_EMAILS": "admin@example.com"
}
```

### Creating Secrets

Via AWS Console:

1. Go to AWS Secrets Manager
2. Store a new secret
3. Choose "Other type of secret"
4. Enter key-value pairs
5. Name: `portfolio/env/production` or `portfolio/repo`

Via AWS CLI:

```bash
aws secretsmanager create-secret \
  --name portfolio/env/production \
  --secret-string '{"OPENAI_API_KEY":"sk-...","NEXTAUTH_SECRET":"..."}'
```

### Updating Secrets

```bash
aws secretsmanager update-secret \
  --secret-id portfolio/env/production \
  --secret-string '{"OPENAI_API_KEY":"sk-new-key",...}'
```

### Referencing in CDK

```bash
# In environment file or GitHub vars
SECRETS_MANAGER_ENV_SECRET_ID=portfolio/env/production
SECRETS_MANAGER_REPO_SECRET_ID=portfolio/repo
```

## Runtime Injection

### How It Works

1. CDK stack creates Lambda functions
2. Secret IDs passed via CloudFront origin headers
3. Lambda@Edge wrapper reads headers on cold start
4. Fetches secrets from Secrets Manager
5. Merges into `process.env`

### Header Flow

```
CloudFront Origin Headers:
x-opn-env-secret-id: portfolio/env/production
x-opn-repo-secret-id: portfolio/repo
x-opn-secrets-region: us-east-1
```

### Lambda Wrapper

```javascript
// Injected by CDK during build
async function loadSecrets() {
  const envSecretId = readHeader('x-opn-env-secret-id');
  const region = readHeader('x-opn-secrets-region');

  const secret = await secretsManager.getSecretValue({
    SecretId: envSecretId,
  });

  const parsed = JSON.parse(secret.SecretString);
  Object.assign(process.env, parsed);
}
```

## Syncing Secrets

### To GitHub

```bash
# Sync production secrets to GitHub
pnpm sync:prod:github
```

Uses `scripts/sync-env-to-github.ts`.

### To AWS

```bash
# Sync production secrets to AWS Secrets Manager
pnpm sync:prod:aws
```

Uses `scripts/sync-env-to-aws.ts`.

### Full Production Sync

```bash
# Sync to both GitHub and AWS
pnpm sync:prod
```

## Secret Rotation

### Manual Rotation

1. Generate new secret value
2. Update in Secrets Manager
3. Redeploy Lambda (or wait for cold start)

### Recommended Rotation

| Secret | Rotation Frequency |
|--------|-------------------|
| `NEXTAUTH_SECRET` | Annually |
| `OPENAI_API_KEY` | On compromise |
| `GH_TOKEN` | Annually |
| `REVALIDATE_SECRET` | On compromise |

## Security Best Practices

### Never Commit Secrets

```gitignore
# .gitignore
.env.local
.env.*.local
.env.production
```

### Use Environment-Specific Values

Different secrets per environment:
- `portfolio/env/production`
- `portfolio/env/staging`

### Principle of Least Privilege

Lambda roles only have `secretsmanager:GetSecretValue` for specific secrets.

### Secret Validation

CDK validates secret references before deployment:

```bash
cd infra/cdk
pnpm validate
```

## Troubleshooting

### Secret Not Found

```
Error: Secrets Manager can't find the specified secret
```

Solutions:
1. Verify secret name/ARN is correct
2. Check secret exists in correct region
3. Confirm IAM permissions

### Permission Denied

```
Error: User is not authorized to perform secretsmanager:GetSecretValue
```

Solutions:
1. Check Lambda execution role
2. Verify secret resource policy
3. Confirm region configuration

### Cold Start Delay

Secrets are fetched on cold start. If latency is critical:
1. Use provisioned concurrency
2. Keep Lambda warm
3. Consider caching in Lambda layer

## Related Documentation

- [Environment Variables](./environment-variables.md) - All variables
- [Deployment](../deployment/environments.md) - Environment setup
- [Infrastructure](../architecture/infrastructure.md) - AWS resources
