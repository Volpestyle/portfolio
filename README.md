# My portfolio website

Live at [jcvolpe.me](https://jcvolpe.me).

## About

A [Next.js](https://nextjs.org/) 15 project using [TailwindCSS](https://tailwindcss.com/)

## Running Locally

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project knowledge cache

The chatbot relies on precomputed summaries + embeddings stored under `generated/`.

1. Make sure `GH_TOKEN`, `PORTFOLIO_GIST_ID`, and `OPENAI_API_KEY` are set.
2. Run:

```bash
pnpm generate:projects
```

This script fetches the latest READMEs, asks OpenAI for short summaries/tags, builds embeddings, and writes them to:

- `generated/repo-summaries.json`
- `generated/repo-embeddings.json`

Commit those files so the deploy target can ship them without extra infra. Re-run whenever you update repos or READMEs.

## Environment variables

The build (especially `/projects/[pid]` static params) calls GitHub during `next build`, so `GH_TOKEN` and `PORTFOLIO_GIST_ID` must be provided as real environment variables that exist in whatever container/runner executes the build (local dev, GitHub Actions, etc.). Secrets that are only injected at runtime are not visible during the build and will cause it to fail. Other sensitive values (`OPENAI_API_KEY`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `AWS_REGION`, `UPSTASH_REDIS_REST_TOKEN`, etc.) are consumed at runtime only, so they can stay in secrets managers or server-only `.env.local`.

## Infrastructure & deployments

### CDK stack (AWS)

The `infra/cdk` sub-package deploys the site as fully serverless infrastructure using **OpenNext** artifacts and a custom CDK stack (no external “open-next-cdk” package):

- Next.js is packaged via `open-next` into `.open-next/` artifacts.
- Static assets live in S3 and are served through CloudFront.
- SSR, API routes, ISR revalidation, and image optimization run as AWS Lambda functions behind the same CloudFront distribution.
- Optional Route53 + ACM wiring is still supported for custom domains.

Usage:

```bash
cd infra/cdk
pnpm install
pnpm lint
pnpm run check    # type-checks + validates the synthesized template without Docker builds
pnpm cdk bootstrap   # only once per account/region

# Provide env via .env.cdk (see infra/cdk/.env.example) or export variables, then:
# Be sure to run `pnpm run build:web` first so .open-next/ exists (CDK can also build via pnpm if needed).
pnpm cdk deploy
```

**Important:** This stack uses Lambda@Edge, so deploy in **us-east-1**:

```bash
export CDK_DEFAULT_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=<your-account-id>
pnpm cdk deploy
```

Key env knobs (can live in `.env.cdk`, your shell, or CI):

- `APP_DOMAIN_NAME`, `APP_HOSTED_ZONE_DOMAIN`, `APP_CERTIFICATE_ARN` – optional custom domain + HTTPS
- `APP_ALTERNATE_DOMAINS` – comma-separated SANs (e.g., `www.jcvolpe.me`) for the ACM certificate
- `APP_ENV_VARS` – comma-separated list of **non-secret** env var names that should be forwarded into each Lambda (e.g., `APP_ENV_VARS=NEXT_PUBLIC_SITE_URL,PORTFOLIO_FEATURE_FLAG`)
- `APP_ENV_PREFIXES` – optional prefixes auto-forwarded to the Lambda environment (defaults to `NEXT_,UPSTASH_,PORTFOLIO_,GH_,SECRETS_,AWS_ENV_,AWS_REPO_,AWS_SECRETS_,AWS_REGION`)
- `APP_ENV_BLOCKLIST` – comma-separated env var names that must never be injected (defaults to `OPENAI_API_KEY,SECRET_ACCESS_KEY,AWS_SECRET_ACCESS_KEY,ACCESS_KEY_ID,AWS_ACCESS_KEY_ID,GH_TOKEN,UPSTASH_REDIS_REST_TOKEN`)

**Edge runtime note:** Keep any Secrets Manager access in regional Lambda handlers (function URLs or API routes). The Lambda@Edge SSR function runs without secrets and must not call Secrets Manager directly.

When `APP_DOMAIN_NAME` and `APP_HOSTED_ZONE_DOMAIN` are set, the stack automatically looks up the matching Route53 hosted zone and issues a DNS-validated ACM certificate for the domain (unless you provide `APP_CERTIFICATE_ARN`). Anything listed in `APP_ENV_VARS`/`APP_ENV_PREFIXES` must be defined in the shell (or CI) before running `pnpm cdk deploy`.

### GitHub Actions (main branch)

The workflow at `.github/workflows/deploy.yml` builds, validates, and deploys the stack on every `main` push (and via manual dispatch). Before pushing, run `pnpm sync:prod` (or another env) so the **REPO VARS/REPO SECRETS** sections in `.env.production` are mirrored to GitHub and the production secrets land in AWS Secrets Manager. If you only want the GitHub side inside CI, use `pnpm sync:prod:github`.

- **validate job** (runs on pushes, PRs, and manual triggers) installs dependencies, runs `pnpm lint`, runs the OpenNext packaging via `pnpm run build`, installs `infra/cdk`, and executes `pnpm run check` to type-check and assert the synthesized CDK template.
- **deploy job** (pushes to `main` and manual runs only) depends on the validate job, reinstalls dependencies, re-runs `pnpm run build:web` to ensure `.open-next/` exists, assumes the AWS IAM role defined by `CDK_DEPLOY_ROLE_ARN`, and runs `pnpm cdk deploy --require-approval never`, which publishes the new Lambda/S3/CloudFront artifacts (no Docker build required).

Configure the workflow with:

| Type     | Name                       | Description                                                            |
| -------- | -------------------------- | ---------------------------------------------------------------------- |
| Secret   | `CDK_DEPLOY_ROLE_ARN`      | IAM role arn with permissions to deploy S3/CloudFront/Lambda resources |
| Secret   | `OPENAI_API_KEY`           | Stored in Secrets Manager, resolved at runtime                         |
| Secret   | `SECRET_ACCESS_KEY`        | Consumed at runtime; keep paired with `ACCESS_KEY_ID`                  |
| Secret   | `GH_TOKEN`                 | Personal access token used during `open-next build` and runtime        |
| Secret   | `UPSTASH_REDIS_REST_TOKEN` | Runtime auth token for Upstash REST                                    |
| Variable | `CDK_DEFAULT_REGION`       | **Must be** `us-east-1` for Lambda@Edge                                |
| Variable | `APP_DOMAIN_NAME`          | Optional custom domain (must match ACM cert + hosted zone)             |
| Variable | `APP_HOSTED_ZONE_DOMAIN`   | Hosted zone lookup name (e.g., `jcvolpe.me`)                           |
| Variable | `APP_CERTIFICATE_ARN`      | (Optional) supply an existing ACM cert instead of auto-issuing one     |
| Variable | `APP_ALTERNATE_DOMAINS`    | CSV of SANs (e.g., `www.jcvolpe.me`) to add to the certificate         |
| Variable | `APP_ENV_VARS`             | Comma-separated env var names to inject (non-secret only)              |
| Variable | `APP_ENV_PREFIXES`         | Optional prefixes for automatic env injection                          |
| Variable | `APP_ENV_BLOCKLIST`        | Optional blocklist for env injection (defaults to `OPENAI_API_KEY,SECRET_ACCESS_KEY,AWS_SECRET_ACCESS_KEY,ACCESS_KEY_ID,AWS_ACCESS_KEY_ID,GH_TOKEN,UPSTASH_REDIS_REST_TOKEN`) |
| Variable | `NEXT_PUBLIC_SITE_URL`     | Example of a public runtime env var forwarded to Lambda                |
| Variable | `PORTFOLIO_GIST_ID`        | Required during `open-next build` to fetch project data                |
| Variable | `ACCESS_KEY_ID`            | Forwarded to Lambda (paired with `SECRET_ACCESS_KEY`)                  |
| Variable | `AWS_REGION`               | Runtime AWS region consumed by the app                                 |
| Variable | `UPSTASH_REDIS_REST_URL`   | REST endpoint used by the chat rate limiter/cache                      |

Secrets should be stored in AWS Secrets Manager (mirrored via the `pnpm sync:*` scripts). The Lambda runtime resolves values with `resolveSecretValue`, falling back to env vars only for local development, so `APP_ENV_VARS` should contain configuration data only.

## Documentation

- [Ask My Portfolio — implementation guide](docs/ask-my-portfolio.md)
- [GPT-5 Nano integration overview](docs/gpt5-nano-integration.md)
- [Chat vs. SSR data caching](docs/chat-data-caching.md)
