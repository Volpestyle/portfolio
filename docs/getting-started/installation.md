# Installation

This guide covers setting up the portfolio project for local development.

## Prerequisites

- **Node.js** 20.x or later
- **pnpm** 9.x (package manager)
- **Git**

### Optional (for full feature set)

- **AWS CLI** configured with credentials
- **GitHub Personal Access Token**
- **OpenAI API Key**

## Clone the Repository

```bash
git clone git@github.com:your-org/portfolio.git
cd portfolio
```

## Install Dependencies

```bash
pnpm install
```

This installs dependencies for:
- Root Next.js application
- All workspace packages in `packages/`
- CDK infrastructure in `infra/cdk/`

## Environment Configuration

Create a local environment file:

```bash
cp .env.example .env.local
```

### Minimum Configuration

For basic development, set these variables:

```bash
# Required for auth
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000

# Required for GitHub features
GH_TOKEN=ghp_your_github_pat
PORTFOLIO_GIST_ID=your_gist_id
```

### Optional Configuration

For full functionality:

```bash
# OAuth providers
GH_CLIENT_ID=your_github_oauth_client_id
GH_CLIENT_SECRET=your_github_oauth_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Admin access
ADMIN_EMAILS=your@email.com

# Chat features
OPENAI_API_KEY=sk-your-openai-key

# Rate limiting
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

See [Environment Variables](../configuration/environment-variables.md) for complete documentation.

## Verify Installation

Start the development server:

```bash
pnpm dev
```

The app should be available at `http://localhost:3000`.

## Fixture Mode

For development without AWS resources, the app can run with mock data:

```bash
# In .env.local
BLOG_TEST_FIXTURES=true
PORTFOLIO_TEST_FIXTURES=true
```

This enables:
- Mock blog posts
- Mock portfolio data
- No AWS calls required

## Next Steps

- [Development Guide](./development.md) - Day-to-day development workflow
- [Commands Reference](./commands.md) - Available npm scripts
- [Chat Setup](../features/chat/overview.md) - Configure the AI chat feature
