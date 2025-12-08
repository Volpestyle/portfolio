# Deployment Overview

This document covers the deployment architecture and process for the portfolio application.

## Deployment Stack

| Component | Technology |
|-----------|------------|
| Build | OpenNext (Next.js to Lambda) |
| Infrastructure | AWS CDK |
| CI/CD | GitHub Actions |
| CDN | CloudFront |
| Compute | Lambda@Edge + Regional Lambda |
| Storage | S3 + DynamoDB |

## Deployment Flow

![Deployment Flow](../assets/diagrams/deployment-flow.png)

## Pre-requisites

### AWS Account Setup

1. **OIDC Provider** - GitHub Actions assumes IAM role via OIDC
2. **Deploy Role** - IAM role with CDK deployment permissions
3. **Domain** (optional) - Route53 hosted zone
4. **Certificate** (optional) - ACM certificate in us-east-1

### GitHub Configuration

Repository variables:
- `AWS_REGION` - Deployment region (default: us-east-1)
- `CDK_DEPLOY_ROLE_ARN` - IAM role for deployment
- `APP_DOMAIN_NAME` - Custom domain
- `NEXT_PUBLIC_SITE_URL` - Public URL

Repository secrets:
- `GH_TOKEN` - GitHub PAT for API access
- `REVALIDATE_SECRET` - ISR revalidation secret
- `NEXTAUTH_SECRET` - Auth session secret

## Quick Deploy

### First-Time Setup

1. Configure AWS credentials:
```bash
aws configure
```

2. Bootstrap CDK (once per account/region):
```bash
cd infra/cdk
pnpm exec cdk bootstrap
```

3. Build and deploy:
```bash
# From root
pnpm build
cd infra/cdk
pnpm deploy
```

### Subsequent Deploys

Push to `main` triggers automatic deployment:

```bash
git push origin main
```

Or manual deployment:

```bash
pnpm build
cd infra/cdk && pnpm deploy
```

## Environment Tiers

| Environment | Branch | Domain | Purpose |
|-------------|--------|--------|---------|
| Production | main | example.com | Live site |
| Staging | staging | staging.example.com | Pre-production testing |
| Development | feature/* | - | Local development |

## Post-Deploy Steps

After each deployment:

1. **Cache Invalidation** - CloudFront paths invalidated
2. **Revalidation** - ISR caches refreshed via API
3. **Smoke Tests** - Automated integration tests

## Rollback

### Quick Rollback

Revert to previous commit:

```bash
git revert HEAD
git push origin main
```

### CDK Rollback

CloudFormation automatically rolls back failed deployments. For manual rollback:

```bash
cd infra/cdk
pnpm exec cdk deploy --rollback
```

## Monitoring

Post-deployment monitoring:

1. **CloudWatch Logs** - Lambda execution logs
2. **CloudWatch Metrics** - OpenAI cost tracking
3. **CloudFront Metrics** - Request/error rates
4. **Smoke Test Results** - GitHub Actions artifacts

## Related Documentation

- [CI/CD Pipeline](./ci-cd.md) - GitHub Actions workflow
- [Environments](./environments.md) - Environment configuration
- [Infrastructure](../architecture/infrastructure.md) - AWS resources
