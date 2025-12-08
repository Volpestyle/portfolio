# @portfolio/cdk

AWS CDK infrastructure for the portfolio application.

## Overview

This package defines the complete AWS infrastructure:

- CloudFront distribution with Lambda@Edge
- Lambda functions (server, image optimization, chat streaming)
- DynamoDB tables (blog posts, revalidation cache, chat costs)
- S3 buckets (assets, blog content, media)
- SQS queues and SNS topics
- Route53 DNS records
- Secrets Manager integration

## Commands

```bash
# Build TypeScript
pnpm build

# Validate stack configuration
pnpm validate

# Synthesize CloudFormation template
pnpm synth

# Deploy to AWS
pnpm deploy

# Show diff against deployed stack
pnpm diff

# Destroy stack (use with caution)
pnpm destroy
```

## Stack Resources

### Compute

| Resource | Description |
|----------|-------------|
| Lambda@Edge | Next.js server function |
| Image Optimization Lambda | Next.js image optimizer |
| Chat Lambda | Streaming chat responses |
| Blog Publish Lambda | Scheduled post publishing |
| Revalidation Worker | ISR cache revalidation |

### Storage

| Resource | Description |
|----------|-------------|
| Assets Bucket | Static assets and ISR cache |
| Blog Content Bucket | Markdown blog content |
| Blog Media Bucket | Blog images and attachments |

### Data

| Resource | Description |
|----------|-------------|
| BlogPosts Table | DynamoDB blog metadata |
| Revalidation Table | ISR tag cache |
| ChatRuntimeCost Table | Chat usage tracking |

### Networking

| Resource | Description |
|----------|-------------|
| CloudFront Distribution | CDN with multiple origins |
| Route53 Records | DNS A/AAAA records |
| ACM Certificate | SSL/TLS certificate |

## Configuration

### Environment Variables

The stack reads configuration from environment variables:

```bash
# Domain configuration
APP_DOMAIN_NAME=example.com
APP_HOSTED_ZONE_DOMAIN=example.com
APP_CERTIFICATE_ARN=arn:aws:acm:...
APP_ALTERNATE_DOMAINS=www.example.com

# Secrets
SECRETS_MANAGER_ENV_SECRET_ID=portfolio/env
SECRETS_MANAGER_REPO_SECRET_ID=portfolio/repo

# Runtime
NEXT_PUBLIC_SITE_URL=https://example.com
```

### OpenNext Integration

The stack reads the OpenNext build output from `.open-next/`:

```
.open-next/
├── open-next.output.json   # Build manifest
├── server-function/        # Next.js server
├── image-optimization-function/
└── assets/                 # Static files
```

## Architecture

```
CloudFront
├── Default Behavior → Lambda@Edge (SSR)
├── /api/chat/* → Chat Lambda (streaming)
├── /_next/image → Image Lambda
└── /_next/static/* → S3 (static assets)
```

## Related Documentation

- [Architecture Overview](../../docs/architecture/)
- [Deployment Guide](../../docs/deployment/)
- [Environment Variables](../../docs/configuration/environment-variables.md)
