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

1. Make sure `GITHUB_TOKEN`, `PORTFOLIO_GIST_ID`, and `OPENAI_API_KEY` are set.
2. Run:

```bash
pnpm generate:projects
```

This script fetches the latest READMEs, asks OpenAI for short summaries/tags, builds embeddings, and writes them to:

- `generated/repo-summaries.json`
- `generated/repo-embeddings.json`

Commit those files so Amplify can ship them without extra infra. Re-run whenever you update repos or READMEs.

## Documentation

- [Ask My Portfolio — implementation guide](docs/ask-my-portfolio.md)
- [GPT-5 Nano integration overview](docs/gpt5-nano-integration.md)
- [Chat vs. SSR data caching](docs/chat-data-caching.md)
