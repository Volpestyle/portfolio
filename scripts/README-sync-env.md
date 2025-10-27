# Environment Sync Scripts

Two color-coded helpers keep GitHub environments and AWS Secrets Manager aligned with the annotated `.env.*` files in this repo.

## Features

- ✨ Color-coded output for better readability
- 🔐 Automatic encryption of GitHub secrets
- 🧹 Clears and overwrites GitHub variables/secrets for full alignment
- 📦 Supports both environment and repository scope in GitHub
- ☁️ Publishes ENV/REPO secrets to AWS Secrets Manager as JSON payloads
- 🎯 Environment-specific deployments

## Setup

### 1. Install dependencies

Dependencies are already installed in the project. If needed:

```bash
pnpm install
```

### 2. Configure GitHub access

Create a GitHub Personal Access Token (classic) with the following permissions:

- `repo` (full control of private repositories)
- `workflow` (update GitHub Actions workflows)

Then export your GitHub credentials (or place them in the appropriate `.env.*` file under `REPO VARS` or `REPO SECRETS`):

```bash
export GH_TOKEN="your_personal_access_token"
export GH_OWNER="your-github-username-or-org"
export GH_REPO="your-repo-name"
```

> **Tip:** Persist these values in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.), or store them in the `.env.*` file you sync—`GH_TOKEN` is typically a `REPO SECRET`, while `GH_OWNER`/`GH_REPO` can live under `REPO VARS`.

### 3. Configure AWS access

The AWS sync script uses the default credential/config resolution chain. At a minimum set:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1" # or your preferred region
```

Optional overrides:

- `AWS_SECRET_PREFIX` – base path for generated secret names (default `portfolio`)
- `AWS_ENV_SECRET_NAME` / `AWS_ENV_SECRET_NAME_<ENV>` – explicit secret name for `ENV SECRETS`
- `AWS_REPO_SECRET_NAME` / `AWS_REPO_SECRET_NAME_<ENV>` – explicit secret name for `REPO SECRETS`

If `AWS_REGION`/`AWS_DEFAULT_REGION` are not present in your shell, the script falls back to `AWS_REGION` defined in the `.env.*` file you are syncing.

When no explicit names are provided the script writes to:

- Environment secrets → `${AWS_SECRET_PREFIX}/${environment}/env`
- Repository secrets → `${AWS_SECRET_PREFIX}/repository`

### 4. Structure your .env files

Use the special headers to categorize your variables:

```env
# ENV VARS
# Environment-specific public variables
NEXT_PUBLIC_APP_URL=https://example.com

# ENV SECRETS
# Environment-specific private secrets
DATABASE_URL=postgresql://...

# REPO VARS
# Repository-wide public variables
BUILD_VERSION=1.0.0

# REPO SECRETS
# Repository-wide private secrets
AWS_ACCESS_KEY_ID=AKIA...
```

See `env.template` for a complete example.

## Usage

### Quick start

```bash
# Sync local environment (.env.local → GitHub dev environment)
pnpm sync:local

# Sync development environment (.env.development → GitHub dev environment)
pnpm sync:dev

# Sync staging environment (.env.staging → GitHub staging environment)
pnpm sync:staging

# Sync production environment (.env.production → GitHub + AWS)
pnpm sync:prod
```

`pnpm sync:prod` runs the GitHub sync first and then pushes secrets to AWS Secrets Manager. Use `pnpm sync:prod:github` or `pnpm sync:prod:aws` if you need one side only.

### Custom usage

```bash
# GitHub only
tsx scripts/sync-env-to-github.ts --env=.env.custom --environment=custom-env

# AWS only (with optional overrides)
AWS_REGION=us-east-1 tsx scripts/sync-env-to-aws.ts \
  --env=.env.custom \
  --environment=custom-env \
  --secret-prefix=portfolio
```

## How it works

### GitHub sync (`scripts/sync-env-to-github.ts`)

1. **Parse** – reads the `.env` file and categorizes variables by section
2. **Clear** – removes existing GitHub variables/secrets in the target scope
3. **Encrypt** – encrypts secrets using the repo/environment public key (libsodium)
4. **Deploy** – recreates variables/secrets so GitHub matches the local file exactly

### AWS sync (`scripts/sync-env-to-aws.ts`)

1. **Parse** – reuses the same parser to isolate secret sections
2. **Bundle** – builds JSON payloads for `ENV SECRETS` and `REPO SECRETS`
3. **Upsert** – creates the target secrets when missing or writes a new version with `PutSecretValue`

Environment secrets and repository secrets are stored separately so they can be consumed by different services. The script never logs secret values—only the keys being updated.

## Output colors

- 🟢 **Green (✓)** – Successful operations
- 🔴 **Red (✗)** – Errors
- 🔵 **Blue (ℹ)** – Information
- 🟡 **Yellow (⚠)** – Warnings
- 🔷 **Cyan (section headers)** – Progress sections
- ⚫ **Gray (details)** – Additional details

## Example output

GitHub sync (excerpt):

```
🚀 Starting sync from .env.local to dev environment

ℹ Parsed .env.local:
  ENV VARS: 3
  ENV SECRETS: 2
  REPO VARS: 2
  REPO SECRETS: 4

📦 Syncing Repository Variables
  Deleted repo variable: BUILD_VERSION
✓ Set repo variable: BUILD_VERSION
✓ Set repo variable: REPO_NAME
```

AWS sync logs the target secret names plus the keys being updated, for example:

```
🔑 Syncing secrets to AWS Secrets Manager (production)
  ENV SECRET NAME: portfolio/production/env
  REPO SECRET NAME: portfolio/repository
🌍 Environment secrets → portfolio/production/env
  Keys:
    - DATABASE_URL
    - OPENAI_API_KEY
```

## Common use cases

```bash
# Work on feature with local env
pnpm sync:local

# Test in development environment
pnpm sync:dev

# Deploy to staging
pnpm sync:staging

# Production release (updates GitHub + AWS)
pnpm sync:prod
```

## CI/CD integration

If you only need the GitHub portion inside CI, call the narrower command:

```yaml
- name: Sync environment variables
  env:
    GH_TOKEN: ${{ secrets.GH_TOKEN }}
    GH_OWNER: ${{ github.repository_owner }}
    GH_REPO: ${{ github.event.repository.name }}
  run: pnpm sync:prod:github
```

Running `pnpm sync:prod` inside CI additionally requires AWS credentials with permission to `secretsmanager:CreateSecret`, `secretsmanager:PutSecretValue`, and `secretsmanager:DescribeSecret`.

## Troubleshooting

### Missing GitHub Token

```
✗ Missing required environment variables:
  GH_TOKEN - Your GitHub personal access token
```

**Solution**: Export your GitHub credentials (see Setup section).

### Permission Denied

```
✗ Failed to sync: Resource not accessible by personal access token
```

**Solution**: Ensure your GitHub token has `repo` and `workflow` permissions.

### Environment Not Found

The script will automatically create the environment if it doesn't exist.

### File Not Found

```
✗ Failed to sync: ENOENT: no such file or directory
```

**Solution**: Ensure the `.env` file exists at the specified path.

## Security Best Practices

1. **Never commit .env files** - They're in `.gitignore` by default
2. **Use strong tokens** - GitHub tokens should be treated as passwords
3. **Rotate regularly** - Update tokens and secrets periodically
4. **Limit scope** - Only grant necessary permissions to tokens
5. **Use environment secrets** - For sensitive data that varies by environment
6. **Use repo secrets** - For shared sensitive data across all environments

## Limitations

- Requires GitHub Actions to be enabled on the repository
- Personal access tokens (classic) are used (fine-grained tokens not yet fully supported for all endpoints)
- Environments must be used with GitHub Actions workflows to access environment variables/secrets

## Further Reading

- [GitHub Actions Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Variables](https://docs.github.com/en/actions/learn-github-actions/variables)
