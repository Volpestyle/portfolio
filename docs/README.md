# Documentation

Welcome to the portfolio documentation. This guide covers setup, development, architecture, and deployment.

## Quick Links

| Need to... | Go to... |
|------------|----------|
| Set up the project | [Installation](./getting-started/installation.md) |
| Start developing | [Development Guide](./getting-started/development.md) |
| Deploy to production | [Deployment Overview](./deployment/overview.md) |
| Understand the architecture | [Architecture Overview](./architecture/overview.md) |
| Configure the chat | [Chat Configuration](./features/chat/configuration.md) |

## Documentation Structure

### Getting Started

- [Installation](./getting-started/installation.md) - Set up the project
- [Development](./getting-started/development.md) - Day-to-day workflow
- [Commands](./getting-started/commands.md) - Available npm scripts

### Architecture

- [Overview](./architecture/overview.md) - System design
- [Infrastructure](./architecture/infrastructure.md) - AWS resources
- [OpenNext](./architecture/open-next.md) - Build configuration
- [Packages](./architecture/packages.md) - Monorepo structure

### Features

- **Chat System**
  - [Overview](./features/chat/overview.md) - How chat works
  - [Architecture](./features/chat/architecture.md) - Technical details
  - [Configuration](./features/chat/configuration.md) - Tuning options

- **Blog**
  - [Overview](./features/blog/overview.md) - Blog system

- [Projects](./features/projects.md) - GitHub integration
- [Authentication](./features/authentication.md) - NextAuth.js setup

### Configuration

- [Environment Variables](./configuration/environment-variables.md) - Complete reference
- [Secrets Management](./configuration/secrets.md) - Handling secrets

### Deployment

- [Overview](./deployment/overview.md) - Deployment strategy
- [CI/CD](./deployment/ci-cd.md) - GitHub Actions
- [Environments](./deployment/environments.md) - Environment setup

### Testing

- [Overview](./testing/overview.md) - Testing strategy
- [E2E Testing](./testing/e2e-testing.md) - Playwright tests
- [Chat Evals](./testing/chat-evals.md) - Chat quality testing

## Package Documentation

Each package has its own README:

| Package | Description |
|---------|-------------|
| [@portfolio/chat-contract](../packages/chat-contract/) | Type contracts |
| [@portfolio/chat-data](../packages/chat-data/) | Search and retrieval |
| [@portfolio/chat-orchestrator](../packages/chat-orchestrator/) | LLM integration |
| [@portfolio/chat-next-api](../packages/chat-next-api/) | API handlers |
| [@portfolio/chat-next-ui](../packages/chat-next-ui/) | UI components |
| [@portfolio/chat-preprocess-cli](../packages/chat-preprocess-cli/) | Preprocessing |
| [@portfolio/github-data](../packages/github-data/) | GitHub client |
| [@portfolio/test-support](../packages/test-support/) | Test utilities |
| [@portfolio/cdk](../infra/cdk/) | Infrastructure |

## Contributing

When adding new documentation:

1. Place files in the appropriate category folder
2. Use consistent Markdown formatting
3. Include code examples where helpful
4. Link to related documentation
5. Update this index if adding new sections
