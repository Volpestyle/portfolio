# @portfolio/chat-preprocess-cli

CLI tool for preprocessing portfolio content into chat-ready embeddings.

## Overview

This package generates the data required for the chat system's RAG pipeline:

- Fetches portfolio data from GitHub gists
- Generates text embeddings via OpenAI
- Outputs indexed documents for runtime retrieval

## Dependencies

- `@aws-sdk/client-s3` - Optional S3 upload
- `yaml` - Configuration parsing
- `@portfolio/github-data` - GitHub API integration

## Peer Dependencies

- `@portfolio/chat-contract` - Document schemas
- `@portfolio/chat-data` - Indexing utilities

## Usage

```bash
# Run preprocessing
pnpm chat:preprocess

# Preprocess specific tasks
CHAT_PREPROCESS_TASKS='profile,persona' pnpm chat:preprocess --seeOutput
```

## Output

Generates files in `generated/`:

```
generated/
├── persona.json              # AI persona definition
├── profile.json              # Portfolio profile data
├── projects.json             # Project list
├── projects-embeddings.json  # Project vector embeddings
├── resume.json               # Resume data
└── resume-embeddings.json    # Resume vector embeddings
```

## Pipeline

1. **Fetch** - Pull data from GitHub gist (`PORTFOLIO_GIST_ID`)
2. **Transform** - Structure for embedding
3. **Embed** - Generate vectors via OpenAI
4. **Output** - Write to `generated/` directory

## Configuration

Requires environment variables:

| Variable | Description |
|----------|-------------|
| `PORTFOLIO_GIST_ID` | GitHub gist containing portfolio data |
| `GH_TOKEN` | GitHub personal access token |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |

## Related Packages

- [@portfolio/github-data](../github-data/) - GitHub API client
- [@portfolio/chat-data](../chat-data/) - Index generation
- [@portfolio/chat-contract](../chat-contract/) - Output schemas
