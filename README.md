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

The build (especially `/projects/[pid]` static params) calls GitHub during `next build`, so `GH_TOKEN` and `PORTFOLIO_GIST_ID` must be provided as real environment variables that exist in whatever container/runner executes the build (local dev, GitHub Actions, etc.). Secrets that are only injected at runtime are not visible during the build and will cause it to fail. Other sensitive values (`OPENAI_API_KEY`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `UPSTASH_REDIS_REST_TOKEN`, etc.) are consumed at runtime only, so they can stay in secrets managers or server-only `.env.local`.

## Infrastructure & deployments

### CDK stack (AWS)

The `infra/cdk` sub-package contains a CDK app that replaces Amplify. It builds the Next.js app into a Docker image (using `output:standalone`) and provisions:

- A new VPC with private subnets and NAT
- An ECS Fargate cluster running the containerized Next.js server behind an Application Load Balancer
- Optional Route53 + ACM wiring when you provide an existing certificate and hosted zone
- CloudWatch log groups plus simple CPU-based autoscaling rules

Usage:

```bash
cd infra/cdk
pnpm install
pnpm lint
pnpm run check    # type-checks + validates the synthesized template without Docker builds
pnpm cdk bootstrap   # only once per account/region

# Provide env via .env.cdk (see infra/cdk/.env.example) or export variables, then:
pnpm cdk deploy
```

Key env knobs (can live in `.env.cdk`, your shell, or CI):

- `APP_DESIRED_COUNT`, `APP_TASK_CPU`, `APP_TASK_MEMORY` – service sizing
- `APP_DOMAIN_NAME`, `APP_HOSTED_ZONE_DOMAIN`, `APP_CERTIFICATE_ARN` – optional custom domain + HTTPS
- `APP_ALTERNATE_DOMAINS` – comma-separated SANs (e.g., `www.jcvolpe.me`) for the ACM certificate
- `APP_ENV_VARS` – comma-separated list of env var names that should be forwarded into the container (e.g., `APP_ENV_VARS=GH_TOKEN,PORTFOLIO_GIST_ID,OPENAI_API_KEY,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN`)
- `APP_ENV_PREFIXES` – optional prefixes auto-forwarded to the container (defaults to `NEXT_,OPENAI_,UPSTASH_,PORTFOLIO_,GH_,ACCESS_,SECRET_,REGION`)

When `APP_DOMAIN_NAME` and `APP_HOSTED_ZONE_DOMAIN` are set, the stack automatically looks up the matching Route53 hosted zone and issues a DNS-validated ACM certificate for the domain (unless you provide `APP_CERTIFICATE_ARN`). Anything listed in `APP_ENV_VARS`/`APP_ENV_PREFIXES` must be defined in the shell (or CI) before running `pnpm cdk deploy`.

### GitHub Actions (main branch)

The workflow at `.github/workflows/deploy.yml` builds, validates, and deploys the stack on every `main` push (and via manual dispatch). Before pushing, run `pnpm sync:prod` (or another env) so the **REPO VARS/REPO SECRETS** sections in `.env.production` are mirrored to GitHub; the workflow pulls everything it needs from those repo-level contexts.

- **validate job** (runs on pushes, PRs, and manual triggers) installs dependencies, runs `pnpm lint`, builds the Next.js app, installs `infra/cdk`, and executes `pnpm run check` to type-check and assert the synthesized CDK template without performing a Docker build.
- **deploy job** (pushes to `main` and manual runs only) depends on the validate job, assumes the AWS IAM role defined by `CDK_DEPLOY_ROLE_ARN`, and runs `pnpm cdk deploy --require-approval never`, which builds/pushes the Docker image and updates the Fargate service.

Configure the workflow with:

| Type     | Name                       | Description                                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| Secret   | `CDK_DEPLOY_ROLE_ARN`      | IAM role arn with permissions for `cdk bootstrap/deploy` (ECS, ECR, EC2, CloudWatch, etc.) |
| Secret   | `OPENAI_API_KEY`           | Forwarded to the container via `APP_ENV_VARS`                                              |
| Secret   | `SECRET_ACCESS_KEY`        | Consumed at runtime; keep paired with `ACCESS_KEY_ID`                                      |
| Secret   | `GH_TOKEN`                 | Personal access token used during `next build` and runtime                                 |
| Secret   | `UPSTASH_REDIS_REST_TOKEN` | Runtime auth token for Upstash REST                                                        |
| Variable | `AWS_REGION`               | Deployment region, defaults to `us-east-1`                                                 |
| Variable | `APP_DESIRED_COUNT`        | Desired ECS task count                                                                     |
| Variable | `APP_TASK_CPU`             | Fargate task CPU units (e.g., `512`)                                                       |
| Variable | `APP_TASK_MEMORY`          | Fargate task memory in MiB (e.g., `1024`)                                                  |
| Variable | `APP_DOMAIN_NAME`          | Optional custom domain (must match ACM cert + hosted zone)                                 |
| Variable | `APP_HOSTED_ZONE_DOMAIN`   | Hosted zone lookup name (e.g., `jcvolpe.me`)                                               |
| Variable | `APP_CERTIFICATE_ARN`      | (Optional) supply an existing ACM cert instead of auto-issuing one                         |
| Variable | `APP_ALTERNATE_DOMAINS`    | CSV of SANs (e.g., `www.jcvolpe.me`) to add to the certificate                             |
| Variable | `APP_ENV_VARS`             | Comma-separated env var names to inject (see above)                                        |
| Variable | `APP_ENV_PREFIXES`         | Optional prefixes for automatic env injection                                              |
| Variable | `NEXT_PUBLIC_SITE_URL`     | Example of a public runtime env var forwarded to the container                             |
| Variable | `PORTFOLIO_GIST_ID`        | Required during `next build` to fetch project data                                         |
| Variable | `ACCESS_KEY_ID`            | Forwarded to the container (paired with `SECRET_ACCESS_KEY`)                               |
| Variable | `REGION`                   | Runtime AWS region consumed by the app                                                     |
| Variable | `UPSTASH_REDIS_REST_URL`   | REST endpoint used by the chat rate limiter/cache                                          |

Add any other secrets referenced in `APP_ENV_VARS` (GitHub token, Upstash creds, etc.) as repository secrets/variables so the workflow can pass them through to the container. The `pnpm sync:*` scripts handle this automatically when the relevant sections exist in your `.env.*` files.

## Documentation

- [Ask My Portfolio — implementation guide](docs/ask-my-portfolio.md)
- [GPT-5 Nano integration overview](docs/gpt5-nano-integration.md)
- [Chat vs. SSR data caching](docs/chat-data-caching.md)
