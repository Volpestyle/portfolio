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

## Documentation

- [Ask My Portfolio — implementation guide](docs/ask-my-portfolio.md)
- [GPT-5 Nano integration overview](docs/gpt5-nano-integration.md)
- [Chat vs. SSR data caching](docs/chat-data-caching.md)
