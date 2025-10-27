# GitHub Environment Sync Script

A color-coded script to deploy environment variables from `.env` files to GitHub environments and repository variables/secrets.

## Features

- ✨ Color-coded output for better readability
- 🔐 Automatic encryption of secrets
- 🧹 Clears and overwrites variables/secrets for full alignment
- 📦 Supports both environment and repository scope
- 🎯 Environment-specific deployments

## Setup

### 1. Install Dependencies

Dependencies are already installed in the project. If needed:

```bash
pnpm install
```

### 2. Set Up GitHub Token

Create a GitHub Personal Access Token (classic) with the following permissions:

- `repo` (Full control of private repositories)
- `workflow` (Update GitHub Actions workflows)

Then export your GitHub credentials:

```bash
export GH_TOKEN="your_personal_access_token"
export GH_OWNER="your-github-username-or-org"
export GH_REPO="your-repo-name"
```

> **Tip**: Add these to your `~/.zshrc` or `~/.bashrc` to persist them across sessions.

### 3. Structure Your .env Files

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

### Quick Start

```bash
# Sync local environment (.env.local → dev environment)
pnpm sync:local

# Sync development environment (.env.development → dev environment)
pnpm sync:dev

# Sync staging environment (.env.staging → staging environment)
pnpm sync:staging

# Sync production environment (.env.production → production environment)
pnpm sync:prod
```

### Custom Usage

```bash
tsx scripts/sync-env-to-github.ts --env=.env.custom --environment=custom-env
```

## How It Works

### Variable Types

1. **ENV VARS** → GitHub Environment Variables

   - Public, environment-specific
   - Visible in GitHub UI
   - Accessible only in the specified environment

2. **ENV SECRETS** → GitHub Environment Secrets

   - Private, environment-specific
   - Encrypted and hidden in GitHub UI
   - Accessible only in the specified environment

3. **REPO VARS** → GitHub Repository Variables

   - Public, repository-wide
   - Visible in GitHub UI
   - Accessible in all environments

4. **REPO SECRETS** → GitHub Repository Secrets
   - Private, repository-wide
   - Encrypted and hidden in GitHub UI
   - Accessible in all environments

### Sync Process

1. **Parse** - Reads the specified `.env` file and categorizes variables
2. **Clear** - Removes all existing variables/secrets in the target scope
3. **Encrypt** - Encrypts secrets using GitHub's public key (via libsodium)
4. **Deploy** - Creates/updates all variables/secrets in GitHub

This ensures complete alignment between your `.env` files and GitHub.

## Output Colors

- 🟢 **Green (✓)** - Successful operations
- 🔴 **Red (✗)** - Errors
- 🔵 **Blue (ℹ)** - Information
- 🟡 **Yellow (⚠)** - Warnings
- 🔷 **Cyan (Section headers)** - Progress sections
- ⚫ **Gray (Details)** - Additional details

## Example Output

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

🔐 Syncing Repository Secrets
  Deleted repo secret: AWS_ACCESS_KEY_ID
✓ Set repo secret: AWS_ACCESS_KEY_ID
✓ Set repo secret: AWS_SECRET_ACCESS_KEY

🌍 Syncing Environment Variables (dev)
  Environment 'dev' exists
  Deleted env variable: NEXT_PUBLIC_APP_URL
✓ Set env variable: NEXT_PUBLIC_APP_URL
✓ Set env variable: NEXT_PUBLIC_API_URL

🔒 Syncing Environment Secrets (dev)
  Deleted env secret: DATABASE_URL
✓ Set env secret: DATABASE_URL
✓ Set env secret: API_KEY

✨ Sync completed successfully!
```

## Common Use Cases

### Development Workflow

```bash
# Work on feature with local env
pnpm sync:local

# Test in development environment
pnpm sync:dev

# Deploy to staging
pnpm sync:staging

# Production release
pnpm sync:prod
```

### CI/CD Integration

You can also use this script in GitHub Actions:

```yaml
- name: Sync environment variables
  env:
    GH_TOKEN: ${{ secrets.GH__TOKEN }}
    GH_OWNER: ${{ github.repository_owner }}
    GH_REPO: ${{ github.event.repository.name }}
  run: pnpm sync:prod
```

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
