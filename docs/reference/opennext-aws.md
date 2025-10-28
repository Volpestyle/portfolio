### OpenNext on AWS — Architecture and operations

This document explains how this repository deploys a Next.js 15 App Router app to AWS using OpenNext artifacts and a custom CDK stack in `infra/cdk`.

#### What gets deployed

- **CloudFront distribution**: primary entrypoint; default behavior runs SSR via Lambda@Edge; additional behaviors route static assets, image optimization, and other OpenNext origins.
- **S3 assets bucket**: hosts static assets and OpenNext cache objects. Public access is blocked; access is via CloudFront Origin Access Control (OAC).
- **Lambda@Edge (SSR)**: handles SSR and API routes at the origin-request event. A small wrapper injects runtime config safely (no secrets at Edge).
- **Image optimization Lambda (regional)**: exposed via Function URL and fronted by CloudFront with OAC; uses S3 and cache env to serve/transcode images.
- **Additional OpenNext origins (regional)**: any extra function origins from `open-next.output.json` are deployed as regional Lambdas with Function URLs protected by CloudFront.
- **DynamoDB table (tag cache + revalidation index)**: stores tag metadata for Next.js revalidation.
- **SQS queue + DLQ (revalidation worker)**: optional worker processes revalidation events when present in the OpenNext output.
- **Route53 + ACM (optional)**: custom domains and certificates if `APP_DOMAIN_NAME` and hosted zone are provided.
- **CloudWatch log groups**: for all functions, with reasonable retention.

#### Build artifacts and OpenNext config

- OpenNext is configured in `open-next.config.ts` to use:
  - wrapper: `aws-lambda`
  - converter: `aws-cloudfront`
  - `incrementalCache: 's3'`
  - `tagCache: 'dynamodb'`
- The build command `pnpm run build:web` produces `.open-next/` and `open-next.output.json` that the CDK stack consumes.
- The CDK stack will fail fast if `.open-next/` or `open-next.output.json` is missing.

#### Runtime configuration model

We separate configuration for Edge vs. regional Lambdas:

- **Regional Lambdas (image optimizer, additional origins, revalidation worker)**
  - Receive env vars from the synthesized stack (see “Base env” below) and may access AWS Secrets Manager directly.
  - Secrets are referenced via `SECRETS_MANAGER_ENV_SECRET_ID` and `SECRETS_MANAGER_REPO_SECRET_ID` and granted `secretsmanager:GetSecretValue`.

- **Edge function (SSR)**
  - Cannot read Secrets Manager directly. Instead, the stack encodes a safe subset of runtime configuration into custom Origin headers on CloudFront origins.
  - A wrapper replaces the OpenNext server entry to read those headers, reconstruct the runtime config, and set `process.env[...]` before invoking the actual server handler. No secrets are injected at Edge.

Base environment computed by the stack includes:

- `AWS_REGION`, `CACHE_BUCKET_NAME`, `CACHE_BUCKET_KEY_PREFIX`, `CACHE_BUCKET_REGION`
- `CACHE_DYNAMO_TABLE`, `REVALIDATION_QUEUE_URL`, `REVALIDATION_QUEUE_REGION`
- `BUCKET_NAME`, `BUCKET_KEY_PREFIX`

Edge runtime config selection rules (via env on the CDK app):

- `EDGE_RUNTIME_ENV_PREFIXES`: CSV of prefixes allowed at Edge (defaults include `NEXT_PUBLIC_`).
- `EDGE_RUNTIME_ENV_KEYS`: CSV of explicit keys to allow at Edge (e.g., `NODE_ENV,APP_STAGE,CACHE_BUCKET_NAME,...`).
- `EDGE_RUNTIME_ENV_BLOCKLIST`: CSV of keys that must never be sent to Edge (defaults block `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, secrets, etc.).

Stack also supports broad env injection into regional Lambdas via:

- `APP_ENV_VARS`: CSV of non-secret names to inject verbatim.
- `APP_ENV_PREFIXES`: CSV of prefixes auto-forwarded to Lambda env (defaults include `NEXT_,UPSTASH_,PORTFOLIO_,GH_,SECRETS_,AWS_ENV_,AWS_REPO_,AWS_SECRETS_,AWS_REGION`).
- `APP_ENV_BLOCKLIST`: CSV of names that must never be injected (defaults include `OPENAI_API_KEY`, AWS secret keys, tokens, etc.).

#### Security posture

- S3 bucket uses S3-managed encryption, versioning, blocked public access, and enforced TLS.
- CloudFront origins use OAC. Function URLs are restricted to a CloudFront service principal bound to this distribution, preventing direct public access.
- Lambda@Edge never receives secrets; sensitive values are only available in regional Lambdas.
- SES permissions are narrowly attached to the Edge function for email sending.

#### Deploying

1. Build OpenNext artifacts at the repo root:

```bash
pnpm run build:web
```

2. Deploy the CDK app (must be us-east-1 for Lambda@Edge):

```bash
cd infra/cdk
pnpm install
pnpm run check
export CDK_DEFAULT_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=<your-account-id>
pnpm cdk bootstrap   # once per account/region
pnpm cdk deploy
```

3. Key variables you can configure (shell, `.env.cdk`, or CI):

- `APP_DOMAIN_NAME`, `APP_HOSTED_ZONE_DOMAIN`, `APP_CERTIFICATE_ARN`, `APP_ALTERNATE_DOMAINS`
- `APP_ENV_VARS`, `APP_ENV_PREFIXES`, `APP_ENV_BLOCKLIST`
- `EDGE_RUNTIME_ENV_PREFIXES`, `EDGE_RUNTIME_ENV_KEYS`, `EDGE_RUNTIME_ENV_BLOCKLIST`
- `SECRETS_MANAGER_ENV_SECRET_ID`, `SECRETS_MANAGER_REPO_SECRET_ID`

4. CI/CD: `.github/workflows/deploy.yml` builds OpenNext then deploys CDK using an assumed role. Use the provided `pnpm sync:*` scripts to mirror GitHub repo vars/secrets into AWS Secrets Manager as needed.

#### Troubleshooting

- Build fails in CDK: ensure `.open-next/` exists and contains `open-next.output.json` (run `pnpm run build:web`).
- 502s with `MODULE_NOT_FOUND` at runtime: a dependency may be missing from the OpenNext bundle. Rebuild and inspect the server/image bundles.
- 403s on image or custom origins: ensure Function URLs are restricted to the CloudFront distribution (the stack sets this automatically); invalidate CloudFront after deploy if needed.
- Revalidation not working: check DynamoDB table and SQS queue; verify `CACHE_DYNAMO_TABLE` and queue env are present for the worker.
- Logs: see `docs/reference/log-diving.md` for locating and tailing log groups for Edge and regional functions.

#### FAQ

- Adding a new API origin: ensure it appears as a function origin in `open-next.output.json`; the stack will deploy it and front it with CloudFront automatically.
- Changing cache behavior: adjust `buildAdditionalBehaviors` inputs or `open-next.config.ts` cache provider settings; static assets are deployed with long TTL and immutable cache-control headers.
- Custom domains: provide `APP_DOMAIN_NAME` and hosted zone; or pass `APP_CERTIFICATE_ARN` for an existing ACM certificate (must be in us-east-1 for CloudFront).
