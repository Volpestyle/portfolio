# Chat Configuration Notes

How the chat runtime reads configuration and models in this repo.

## Inputs and generated data

- Runtime loads preprocessed artifacts from `generated/`: `projects.json`, `projects-embeddings.json`, `resume.json`, `resume-embeddings.json`, `profile.json`, and `persona.json`.
- `chat.config.yml` is optional, but `models.answerModel` is required; it drives the planner/answer/embedding models and runtime guardrails.
- The preprocess config (`chat-preprocess.config.*`) is used as a fallback for embedding models and the resume filename (default `resume.pdf` under `public/resume/`).

## Model configuration (`models`)

- `answerModel` **required**; `plannerModel` defaults to `answerModel` when omitted.
- `answerModelNoRetrieval` (optional) is used for greetings/meta turns without retrieval.
- `embeddingModel` resolution:
  1. `models.embeddingModel` in `chat.config.yml`
  2. `models.embeddingModel` in `chat-preprocess.config.*`
  3. `projectEmbeddingModel`/`resumeEmbeddingModel` in the preprocess config (prefers a single consistent value).
- `reasoning` supports per-stage settings (`planner`, `answer`, `answerNoRetrieval`); values pass through to OpenAI Responses API `reasoning` options when supported.
- `answerTemperature` is clamped to `[0, 2]`.

## Token limits and retrieval

- `tokens.planner` / `tokens.answer` set per-stage token caps (passed to the orchestrator).
- `retrieval.defaultTopK` and `retrieval.maxTopK` are clamped to the contract max (`RETRIEVAL_REQUEST_TOPK_MAX`); `defaultTopK` cannot exceed `maxTopK`.
- `retrieval.minRelevanceScore` trims low-scoring docs (0–1).
- `retrieval.weights` exposes BM25 vs embedding weighting and recency lambda (each clamped to 0–5).

## Moderation

- `moderation.input` (`enabled`, `model`) gates user messages before the pipeline runs.
- `moderation.output` (`enabled`, `model`, `refusalMessage`, `refusalBanner`) performs output moderation; refusal text is returned through the `/api/chat` handler.

## Runtime cost budget

- `cost.budgetUsd` enables the chat runtime budget guard when set to a positive number. Budget enforcement is disabled entirely when this value is missing or non-positive.
- Budget state is stored in the `COST_TABLE_NAME` DynamoDB table (injected by CDK); optional alerts fan out via `COST_ALERT_TOPIC_ARN` / `CHAT_COST_ALERT_TOPIC_ARN`.
- When the budget is exceeded, `/api/chat` responds with an SSE `error` event (`code: "budget_exceeded"`); turns are allowed while under warning/critical thresholds.

## Logging toggle

- Set `CHAT_LOG_PROMPTS=true` (or `CHAT_LOG_PROMPTS=1`) to include prompts in the runtime logger output; defaults to off.
