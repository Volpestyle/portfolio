# @portfolio/github-data

GitHub API integration using Octokit.

## Overview

This package provides GitHub data access for the portfolio:

- Gist content fetching
- Repository metadata
- File content retrieval

## Dependencies

- `@octokit/rest` - GitHub REST API client
- `@portfolio/chat-contract` - Type definitions

## Usage

```typescript
import { createGitHubClient, fetchGistContent } from '@portfolio/github-data';

const client = createGitHubClient(process.env.GH_TOKEN);

// Fetch portfolio gist
const gistData = await fetchGistContent(client, gistId);

// Access file content
const profile = JSON.parse(gistData.files['profile.json'].content);
```

## Features

### Gist Integration

The portfolio data is stored in a GitHub gist for easy editing:

- `profile.json` - Personal information
- `resume.json` - Work experience
- `projects.json` - Project metadata
- `persona.json` - AI chat persona

### Repository Documentation

Fetches documentation from project repositories for the `/projects/[pid]/doc/[...path]` dynamic routes.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GH_TOKEN` | GitHub Personal Access Token |
| `PORTFOLIO_GIST_ID` | ID of the portfolio data gist |

## Related Packages

- [@portfolio/chat-preprocess-cli](../chat-preprocess-cli/) - Uses this for data fetching
- [@portfolio/chat-contract](../chat-contract/) - Data type definitions
