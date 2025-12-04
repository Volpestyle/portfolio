# Portfolio Chat Engine — Architecture & Design Spec (vNext · 2025‑11‑23)

Single‑owner “talk to my portfolio” engine (reconfigurable per deployment), built as a staged RAG pipeline with a lightweight planner, retrieval, and an answerer that owns UI hints.

---

## 0. Summary

Portfolio Chat Engine is a domain‑agnostic, persona‑shaped RAG system that lets users chat with a portfolio owner (“I”) about their work: projects, experience, skills, and background.

The engine is parameterized by an OwnerConfig, so the same code can power:

- A software engineer’s personal site.
- A freelance designer’s portfolio.
- A research group’s publication showcase.
- A team / organization profile.

At a high level:

- **Inputs**
  - User messages (chat history).
  - OwnerConfig (who this "I" is, and in what domain).
  - Preprocessed portfolio data:
    - Projects, resume‑like experiences, profile text, persona summary.
    - Embedding indexes for semantic retrieval.
- **Pipeline**
  - Planner → Retrieval → Answer (no Evidence stage).
  - All LLM stages use the OpenAI Responses API with structured JSON output.
  - Planner emits search queries + cards toggle; Answer owns uiHints (card IDs).
- **Outputs**
  - Streamed answer text in first person ("I…").
  - Answer‑aligned UI hints (uiHints.projects / uiHints.experiences) that map to retrieved docs.
  - Optional per‑turn reasoning trace (plan, retrieval, answer metadata), streamed only when requested per run.

**Design goals**

- Grounded – Only asserts facts present in the owner's portfolio data.
- Answer‑aligned UI – Cards and lists shown to the user come from Answer.uiHints (validated against retrieval).
- Query‑aware – Planner emits targeted queries and a cards toggle; Answer infers tone/structure from the question.
- Observable – Every turn has a structured reasoning trace and token metrics.
- Composable – Orchestrator and UI are decoupled via a clean SSE contract.
- Reusable – Driven by OwnerConfig and data providers; domain-agnostic.
- Cheap & fast – Uses nano-class runtime models (placeholder "nano model"); offline preprocessing uses a full-size model.
- Measurable – Preprocessing and runtime both emit token and cost metrics.

Companion docs:

- Runtime cookbook and guardrails: `docs/features/chat/implementation-notes.md`.
- Chat evals: `docs/features/chat/evals-and-goldens.md`.

---

## 1. Goals & Requirements

### 1.1 Product Goals

For a given owner (person / team / org), users should be able to:

- Chat with the portfolio owner as if they were present, in a consistent "I" voice.
- Ask questions about:
  - Projects – what, why, how, tech, impact.
  - Experience – jobs, internships, education, other roles.
  - Skills – tools, languages, frameworks, domains.
  - High‑level "about you" – background, focus areas, location, domain label.
- Get answers that are:
  - Grounded in actual portfolio data.
  - Stylistically aligned with the owner's persona.
  - UI‑consistent with the text answer:
    - Cards shown must be relevant to the answer (e.g. only Go‑using work when answering "Have you used Go?").
- Have light meta / chit‑chat ("hi", "thanks", "how do you work?") without the bot degenerating into a generic assistant.
- Ask:
  - Binary fact‑check questions ("Have you used Go?").
  - List / enumeration questions ("Which projects have you used Go on?").
  - Narrative or comparison questions ("Tell me about your React experience", "React vs Vue in your work?").
  - Meta/chit‑chat about the chat itself.

### 1.2 Functional Requirements

Per chat turn, the engine MUST:

- Build a set of retrieval queries across `projects`, `resume`, and/or `profile`, plus a `cardsEnabled` flag. Empty queries are allowed for greetings/meta or when the conversation already contains the needed facts.
- Run retrieval over precomputed indexes when queries are present:
  - BM25 shortlist.
  - Embedding re‑ranking.
  - Recency‑aware scoring.
- Produce an AnswerPayload:
  - `message` in first person (“I”).
  - Optional `thoughts` (dev-only).
  - Optional `uiHints` with ordered project/experience IDs (subset of retrieved docs).
- Stream back to the frontend:
  - Answer tokens.
  - UI payload derived from Answer.uiHints (which project / experience cards to render).
  - Optional incremental reasoning trace (planner → retrieval → answer).

### 1.3 Non‑Functional Requirements

- **Latency**
  - Planner uses a nano-class model; Answer uses nano or mini (mini recommended for voice adherence).
  - Answer streams tokens as soon as they're available.
  - Target: time-to-first-visible-activity < 500ms, full response < 3s for typical turns.
  - Note: Traditional TTFT (time-to-first-answer-token) is less critical here because the reasoning trace provides continuous visible feedback throughout the pipeline. Users see plan → retrieval summary → answer tokens as each stage completes. This progressive disclosure keeps perceived latency low even though multiple LLM calls run sequentially before the answer streams.
- **Cost**
  - Runtime: Planner → nano; Answer → nano or mini.
  - Preprocessing (offline): full-size model and text‑embedding‑3‑large for one‑time work.
  - Track tokens & estimated USD cost for both preprocessing and runtime.
  - See `docs/features/chat/rate-limits-and-cost-guards.md` for cost alarms and rate limiting.
- **Safety & Grounding**
  - Only asserts facts present in the owner's portfolio data (projects / resume / profile / persona).
  - UI cards must be consistent with the text answer and retrieved docs.
  - Clear behavior when retrieval is empty or weak.
  - Basic moderation for user inputs (and optionally outputs).
- **Abuse Prevention**
  - Per-IP rate limiting via Upstash Redis (see §1.4 for implementation details).
  - Fail-closed on limiter backend unavailability (HTTP 503).
- **Maintainability**
  - Behavior driven by LLM prompts, JSON schemas (Zod), and configuration (OwnerConfig, ModelConfig), not ad‑hoc string heuristics.
- **Debuggability**
  - Structured logs of each pipeline stage.
  - Reasoning traces and LLM usage available in dev tools.
  - Golden prompts and evals to detect regressions.
- **Deployment flexibility**
  - Single‑owner by default; the same stack can be reconfigured for another portfolio by swapping OwnerConfig + data providers.

### 1.4 Rate Limiting

Per-IP Upstash Redis limiter: 5/min, 40/hr, 120/day. Fail-closed if Redis or IP detection fails; dev bypass when Redis env vars are missing, otherwise enforced in dev unless `ENABLE_DEV_RATE_LIMIT=false`. Implementation details live in `docs/features/chat/implementation-notes.md#11-rate-limiting-upstash-sliding-window`.

> **Implementation note:** Rate limiting is enforced in the Next.js `/api/chat` route (Upstash Redis). The orchestrator stays limiter-free; see `docs/features/chat/implementation-notes.md` for route wiring.

### 1.5 Cost Monitoring & Alarms

Runtime budget defaults to $10/month (override via `CHAT_MONTHLY_BUDGET_USD`) with warn/critical/exceeded thresholds at $8/$9.50/$10. Dynamo tracks spend per calendar month; CloudWatch/SNS alarm uses a rolling 30-day sum of daily cost metrics. Runtime only (Planner/Answer + embeddings). See `docs/features/chat/implementation-notes.md#12-cost-monitoring--alarms` for Dynamo/CloudWatch/SNS wiring.

> **Implementation note:** Budget enforcement happens in the Next.js `/api/chat` route. The orchestrator emits per-stage `StageUsage` with `costUsd`; the route aggregates and blocks turns that would exceed the Dynamo-tracked monthly budget.

---

## 2. High‑Level Architecture

### 2.0 System Overview

![Portfolio Chat Engine - High-Level Runtime Architecture](../../../generated-diagrams/portfolio-chat-architecture.png)

_Figure 2.0: High-level runtime architecture showing the flow between client, server, data layer, infrastructure, and OpenAI APIs._

### 2.1 Components

- **Owner & Domain Config**
  - OwnerConfig describes who this portfolio belongs to and in what domain.
  - ModelConfig pins model choices and snapshots.
  - DataProviders load preprocessed corpora for that owner.
- **Frontend (Next.js app)**
  - Chat UI (dock, thread, composer, attachments).
  - Portfolio UI: project cards, resume / experience views rendered by the host app.
  - Cards are driven by Answer.uiHints, not raw retrieval (engine returns IDs; consumer renders components).
  - Optional reasoning/debug UI built by the host app using emitted reasoning data; the engine ships data, not a built-in drawer/toggle.
- **Chat API (Next.js route `/api/chat`)**
  - Accepts chat requests with history (and a fixed ownerId for the deployment) plus a client‑assigned assistant message ID; requests with any other ownerId are rejected (single-owner only).
  - Uses the configured OwnerConfig + data providers for that owner, not a multi-tenant lookup.
  - Runs the orchestrator pipeline.
  - Streams back SSE events: stage, reasoning, token, item, ui, attachment, ui_actions, done, error.
- **Orchestrator (packages/chat-orchestrator)**
  - Pure implementation of Planner → Retrieval → Answer (three stages).
  - Assembles ReasoningTrace and UiPayload.
  - Handles retrieval reuse within the sliding window where applicable.
  - Derives UI from Answer.uiHints, validated against retrieved docs.
- **Retrieval & Data Layer (packages/chat-data)**
  - Corpus loaders from generated/.
  - BM25 search + embedding re‑ranking + recency scoring.
  - Process‑level and per‑session retrieval caching.
- **LLM Integration**
  - callPlanner and callAnswer wrappers over the OpenAI Responses API.
  - Use `response_format: { type: "json_schema", json_schema: ... }`.
  - Answer stage streams AnswerPayload.message while capturing the full JSON (including optional thoughts).
- **Preprocessing & Tooling (packages/chat-preprocess-cli)**
  - CLI to build generated artifacts from:
    - data/chat/\* (resume PDF, profile markdown),
    - GitHub (projects), via a gist‑based repo config.
  - Uses full-size model and text‑embedding‑3‑large for enrichment & embeddings.
  - Emits metrics for token usage & cost per run.
- **Observability & Devtools**
  - Logging of all pipeline stages and token usage.
  - Optional dev UI to inspect reasoning traces and metrics.
  - Export traces and preprocess metrics for offline analysis.

### 2.2 Runtime Configuration & Bootstrapping

![Portfolio Chat Engine - Runtime Data Usage](../../../generated-diagrams/portfolio-chat-runtime-data.png)

_Figure 2.2: Runtime data usage showing how generated artifacts are loaded and used at runtime._

> **Note:** All model IDs in this spec (e.g., "nano model", "mini model", "full-size model") are placeholders. Actual model IDs are configured in `chat.config.yml`.

Runtime wiring uses typed configs exported from packages/chat-contract:

```ts
type OwnerConfig = {
  ownerId: string;
  ownerName: string;
  ownerPronouns?: string; // e.g. "she/her", "he/him", "they/them"
  domainLabel: string; // e.g. "software engineer", "illustrator", "research group"
  portfolioKind?: 'individual' | 'team' | 'organization';
};

type ModelConfig = {
  plannerModel: string; // nano model id
  answerModel: string; // nano or mini model id (mini recommended for voice adherence)
  embeddingModel: string; // embedding model id
  answerTemperature?: number; // optional Answer-stage temperature (0-2; undefined uses model default)
  reasoning?: {
    planner?: ReasoningEffort; // minimal | low | medium | high (reasoning-capable models only)
    answer?: ReasoningEffort;
  };
};

type EmbeddingIndex = {
  meta: {
    schemaVersion: string;
    buildId: string;
  };
  entries: { id: string; vector: number[] }[];
};

type DataProviders = {
  projects: ProjectDoc[];
  resume: ResumeDoc[]; // ExperienceRecord.linkedProjects populated by preprocessing
  profile: ProfileDoc | null; // identity context is optional but recommended
  persona: PersonaSummary; // generated during preprocessing
  embeddingIndexes: {
    projects: EmbeddingIndex;
    resume: EmbeddingIndex;
  };
};

// Example chat.config.yml excerpt with per-stage reasoning
// (models map directly to ModelConfig; reasoning is optional and only used on reasoning-capable models)
/*
models:
  plannerModel: gpt-5-nano-2025-08-07
  answerModel: gpt-5-mini-2025-08-07  # mini recommended for better voice/persona adherence
  embeddingModel: text-embedding-3-large
  reasoning:
    planner: low
    answer: low
*/

// Server wiring uses createChatApi (packages/chat-next-api),
// which wraps createChatRuntime under the hood.
type ChatApiConfig = {
  retrieval: RetrievalOptions; // project/experience/profile repositories + semantic rankers
  runtimeOptions?: ChatRuntimeOptions; // owner, modelConfig, persona, identityContext, tokenLimits, logger
};

const chatApi = createChatApi({
  retrieval: {
    projectRepository,
    experienceRepository,
    profileRepository,
    projectSemanticRanker,
    experienceSemanticRanker,
  },
  runtimeOptions: {
    owner: ownerConfig,
    modelConfig,
    persona,
    identityContext,
  },
});

chatApi.run(openaiClient, messages, {
  ownerId: ownerConfig.ownerId,
  reasoningEnabled, // emit reasoning when true
  onAnswerToken,
  onUiEvent,
  onReasoningUpdate,
});
```

Model IDs for Planner/Answer/Embeddings come from `chat.config.yml`; the strings in this spec are placeholders, not hardcoded defaults.

Planner quality note: on reasoning-capable models, set `reasoning.planner` to `low` or higher—`minimal` tends to reduce plan accuracy and produces less inclusive retrieval coverage.

Reasoning emission is a per-run option (`reasoningEnabled`), not part of the runtime config.

Placeholders note: In prompts (see `packages/chat-orchestrator/src/pipelinePrompts.ts`) we use `{{OWNER_NAME}}` and `{{DOMAIN_LABEL}}` as template placeholders. Runtime must replace those using `OwnerConfig.ownerName` and `OwnerConfig.domainLabel` before sending prompts to the LLM.

### 2.3 Pipeline Overview

Quick at-a-glance view of purpose, inputs/outputs, and primary tech. See §5 for detailed behavior and prompts.

| Stage     | Purpose                                                           | Inputs                                                                                | Outputs                                                                                                  | Primary tech                                                                                                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Planner   | Decide what to search + whether cards should render               | Latest user message + short history; OwnerConfig + persona baked into system prompt   | PlannerLLMOutput (`queries[]`, `cardsEnabled`, optional `topic`)                                         | OpenAI Responses API (json schema) with `ModelConfig.plannerModel` (nano class)                                            |
| Retrieval | Turn planner queries into ranked document sets                    | PlannerLLMOutput.queries + corpora (projects/resume/profile) + embedding indexes      | Retrieved docs per source (scored and filtered)                                                          | MiniSearch BM25 + text-embedding-3-large re-rank + recency scoring (projects/resume); profile short-circuited              |
| Answer    | Turn retrieval into first-person text + UI hints (cards)         | PlannerLLMOutput + retrieved docs + persona/profile + short history                   | AnswerPayload (message + optional thoughts + optional uiHints.projects/experiences)                      | OpenAI Responses API with `ModelConfig.answerModel` (nano or mini; mini recommended for voice adherence), streaming tokens |

---

## 3. Data Model & Offline Preprocessing

![Portfolio Chat Engine - Offline Preprocessing Pipeline](../../../generated-diagrams/portfolio-chat-preprocessing.png)

_Figure 3.0: Offline preprocessing pipeline showing the flow from source files through CLI processing to generated artifacts._

Portfolio corpora are typed artifacts produced by chat-preprocess-cli and loaded through DataProviders.

### 3.0 Notes

All generated corpora (projects, resume, profile) are assumed safe for chat use; there is no doc safety taxonomy or override mechanism in this spec. Retrieved docs are all eligible for answering; filtering is purely based on relevance/grounding, not sensitivity.

### 3.1 Projects (GitHub gist + README‑only summarization)

Each GitHub repo we care about corresponds to exactly one ProjectDoc.

```ts
type ProjectContext = {
  type: 'personal' | 'work' | 'oss' | 'academic' | 'other';
  organization?: string | null;
  role?: string | null;
  timeframe?: {
    start?: string | null; // e.g. "2024-01"
    end?: string | null; // e.g. "2024-06" or null for current
  } | null;
};

type ProjectDoc = {
  id: string; // stable projectId from gist
  slug: string; // used in URLs
  name: string;
  oneLiner: string;
  description: string;

  impactSummary?: string | null;
  sizeOrScope?: string | null;

  techStack: string[]; // "React", "Go", "Postgres"
  languages: string[]; // "TypeScript", "Python"
  tags: string[]; // free-form tags: "rag", "AI", "LLM", "serverless", "cv"

  context: ProjectContext;
  bullets: string[];

  githubUrl?: string | null;
  liveUrl?: string | null;

  // Runtime-only fields (not persisted in generated/projects.json)
  _score?: number; // Combined retrieval score, set during search
  _signals?: Record<string, unknown>; // Debug signals from scoring pipeline
};
```

#### 3.1.1 Repo selection via GitHub gist

Source of truth for which repos are included:

```ts
type PortfolioRepoConfig = {
  repo: string; // "owner/name"
  projectId: string; // stable project ID => ProjectDoc.id
  displayName?: string; // optional override for UI name
  include?: boolean; // default true
  hideFromChat?: boolean; // show on public site but skip in chat
  linkedToCompanies?: string[]; // company names from resume (exact match)
};
```

- A GitHub gist contains `PortfolioRepoConfig[]`.
- The same gist drives:
  - The public Next.js projects page.
  - The chat preprocessing step.
  - Cross-corpus linking (via `linkedToCompanies`).

#### 3.1.2 GitHub → ProjectDoc pipeline (README‑only)

For each repo in the gist where `include !== false` and `hideFromChat !== true`:

1. **Fetch repo**
   - Clone / shallow clone the repo at a specified branch (e.g., main).
2. **Read README**
   - Find root README (e.g., README.md, README.mdx).
   - Treat README as the canonical source of project information for chat.
3. **Summarize & enrich (full-size LLM)**
   - Use a full-size model with a schema‑driven prompt to produce a ProjectDoc, given the README content.
   - Instructions:
     - Derive name, oneLiner, description, impactSummary, sizeOrScope, techStack, languages, tags, context, bullets, and URLs only from the README.
     - `tags` should be short free‑form phrases capturing domains (e.g., “AI”, “backend”), techniques (e.g., “LLM”, “computer vision”), and architectures/approaches (e.g., “microservices”, “serverless”).
     - Don’t invent organizations/roles/timeframes that aren’t clearly shown in README.
4. **Embeddings**
   - Build embedding input from:
     - name
     - oneLiner
     - description
     - impactSummary
     - `techStack.join(', ')`
     - `languages.join(', ')`
     - `tags.join(', ')`
   - Compute vector using text-embedding-3-large.
   - Add `{ id: projectId, vector }` to `EmbeddingIndex.projects`.
5. **Outputs**
   - Write:
     - `generated/projects.json` (ProjectDoc[]).
     - `generated/projects-embeddings.json` (EmbeddingIndex.projects).
   - Emit per‑repo metrics (tokens, cost, repo name) to `generated/metrics/preprocess-<runId>.json`.

### 3.2 Resume (PDF → structured entries)

Resume is provided as a PDF, configured in chat-preprocess.config.yml.

```ts
type ExperienceType = 'full_time' | 'internship' | 'contract' | 'freelance' | 'other';

type ExperienceRecord = {
  type?: 'experience';
  id: string;

  company: string;
  title: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent?: boolean;

  experienceType?: ExperienceType;
  summary?: string | null;
  bullets: string[];
  skills: string[]; // free-form: "LLM", "PyTorch", "Kubernetes", "React"

  linkedProjects?: string[]; // ProjectDoc ids, filled by cross-corpus linking (see §3.5)
  monthsOfExperience?: number | null; // derived from start/end dates when possible
  impactSummary?: string | null;
  sizeOrScope?: string | null;

  // Runtime-only fields (not persisted in generated/resume.json)
  _score?: number; // Combined retrieval score, set during search
  _signals?: Record<string, unknown>; // Debug signals from scoring pipeline
};

type EducationRecord = {
  type: 'education';
  id: string;
  institution: string;
  degree?: string | null;
  field?: string | null;
  location?: string | null;
  startDate?: string;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string | null;
  bullets: string[];
  skills: string[];
};

type AwardRecord = {
  type: 'award';
  id: string;
  title: string;
  issuer?: string | null;
  date?: string | null;
  summary?: string | null;
  bullets: string[];
  skills: string[];
};

type SkillRecord = {
  type: 'skill';
  id: string;
  name: string;
  category?: string | null; // "language", "framework", "tool", "domain"
  summary?: string | null;
};

type ResumeDoc = ExperienceRecord | EducationRecord | AwardRecord | SkillRecord;
```

#### 3.2.1 Resume ingestion pipeline

1. **PDF → text**
   - Use a PDF→text extractor (no OCR unless required).
   - Preserve headings/bullets where possible.
2. **Section detection (heuristic)**
   - Identify common headings:
     - “Experience”, “Work Experience”, “Professional Experience”.
     - “Education”.
     - “Projects”.
     - “Skills”.
     - “Awards” / “Honors”.
   - Group lines under headings.
3. **LLM structuring (full-size LLM)**

- Use a full-size model with a schema‑driven prompt to map the extracted resume text into ExperienceRecord[], EducationRecord[], AwardRecord[], SkillRecord[].
- Instructions:
  - Preserve exact company/school/job titles.
  - Normalize `startDate`/`endDate` into YYYY-MM or similar.
  - Extract bullets as arrays.
  - Populate skills with explicit tools, frameworks, and domains mentioned.
  - Classify each experience into `experienceType` ("full_time", "internship", "contract", "freelance", "other") based on role, keywords, and context.
  - Do not invent employers, degrees, or skills that aren’t in the PDF.

4. **Duration computation (monthsOfExperience)**
   - For each ExperienceRecord with a valid start/end range:
     - Compute `monthsOfExperience` as the month‑difference between `startDate` and `endDate` (or current month if `endDate` is null and `isCurrent` is true).
   - If start/end dates are missing or ambiguous, leave `monthsOfExperience` as null.
5. **Embeddings**
   - For each ExperienceRecord and SkillRecord:
     - Build embedding input: `summary + '\n' + bullets.join(' ') + '\n' + skills.join(', ')`.
     - Compute vector via text-embedding-3-large.
     - Add `{ id, vector }` to `EmbeddingIndex.resume`.
6. **Outputs**
   - Write:
     - `generated/resume.json` (ResumeDoc[]).
     - `generated/resume-embeddings.json` (EmbeddingIndex.resume).
   - Track metrics (tokens, cost, resume pdfPath) in `generated/metrics/preprocess-<runId>.json`.

### 3.3 Profile & Persona

```ts
type ProfileDoc = {
  id: string; // typically "profile"
  fullName: string;
  headline?: string | null;
  location?: string | null;
  currentRole?: string | null;
  about: string[]; // paragraphs
  topSkills: string[];
  featuredExperiences?: string[]; // ExperienceRecord ids
  socialLinks: {
    platform: string; // "GitHub", "LinkedIn", etc.
    label: string;
    url: string;
    blurb?: string | null;
  }[];
};

type PersonaSummary = {
  systemPersona: string; // system prompt text describing persona
  shortAbout: string; // 1‑2 line self‑intro
  styleGuidelines: string[]; // writing style instructions
  voiceExamples?: string[]; // example user/chatbot exchanges showing desired tone
  generatedAt: string;
};
```

- **Profile is required.** It is ingested from a Markdown file in `data/chat/profile.md` using a full-size model to structure into a single ProfileDoc (with `id` typically set to `"profile"`). If `profile.md` is missing or empty, preprocessing fails with `PREPROCESS_PROFILE_REQUIRED`.
- Persona is synthesized from the resume + projects + profile using a full-size model and stored as a PersonaSummary. All three sources are required to produce a high-quality, grounded persona.

#### 3.3.1 Profile ingestion

1. **Markdown → text**
   - Read `data/chat/profile.md` as UTF‑8 text.
2. **LLM structuring (full-size LLM)**
   - Use a full-size model with a schema‑driven prompt to map the markdown into a single ProfileDoc.
   - Instructions:
     - Set `id` to a stable value, typically `"profile"`.
     - Preserve exact name, headline, and social URLs.
     - Split the “about” body into paragraphs (`about: string[]`).
     - Populate `topSkills` with explicit tools/frameworks/domains mentioned.
3. **Outputs**
   - Write:
     - `generated/profile.json` (ProfileDoc).
   - Track metrics (tokens, cost, profileMarkdownPath) in `generated/metrics/preprocess-<runId>.json`.

#### 3.3.2 Voice Examples

Voice examples are user/chatbot exchange samples that define the chatbot's personality, tone, and conversational style. They are stored in `PersonaSummary.voiceExamples` and sourced from `data/chat/profile.json`.

**Purpose:**

- Provide few-shot examples of desired conversational tone (casual, playful, direct, etc.).
- Give the Answer stage concrete phrasing patterns to emulate.
- Allow persona customization without modifying prompts.

**Format:**

Each voice example is a single string showing a user message and the expected chatbot response:

```
"USER: sup, who are you? CHATBOT: yo, i'm James. who am i? bruh... hello? its in the url..."
"USER: do you touch grass? CHATBOT: i touch APIs. james allegedly touches grass on my behalf."
"USER: how smart are you? CHATBOT: smart enough to explain transformers, dumb enough to still off-by-one an array index."
```

**Injection into prompts:**

At runtime, the Answer stage system prompt is built dynamically via `buildAnswerSystemPrompt()` in `packages/chat-orchestrator/src/runtime/pipeline.ts`. When `persona.voiceExamples` is present and non-empty:

1. A dedicated section is prepended to the Answer system prompt:

   ```
   **IMPORTANT - VOICE EXAMPLES** — Treat these as your base programming and match this voice/tone as closely as possible. Its even ok to reuse these exact responses:
   - USER: sup, who are you? CHATBOT: yo, i'm James...
   - USER: do you touch grass? CHATBOT: i touch APIs...
   ...
   ```

2. The base `answerSystemPrompt` (from `pipelinePrompts.ts`) explicitly references voice examples in the Tone section:
   - "Match the phrasing/vibe of the voiceExamples (casual, direct, a little playful) while staying truthful."
   - "For meta/greetings, avoid a resume-style bio or listing tech unless the user asked; keep it short and welcoming."

**Reuse is allowed**: The prompt explicitly permits reusing exact responses from voice examples when appropriate (e.g., if a user asks "do you touch grass?" the chatbot can respond with the example verbatim).

### 3.4 Embeddings

```ts
type EmbeddingIndex = {
  meta: {
    schemaVersion: string;
    buildId: string;
  };
  entries: { id: string; vector: number[] }[];
};
```

- Separate embedding indexes for:
  - projects
  - resume
- Profile is intentionally not embedded (single document, auto-included for narrative/meta when helpful) to avoid extra latency/cost.
- Preprocessing fails if any items cannot be embedded (no partial indexes).

### 3.5 Semantic Enrichment (no fixed taxonomy)

Semantic enrichment is purely free‑form:

- For each project, the full-size model:
  - Normalizes tools/frameworks into techStack / languages.
  - Generates tags as short free‑form keywords/phrases describing domains, techniques, and architectures.
- For each experience, the full-size model:
  - Populates skills with tools/frameworks/domains.
- There is no fixed tag vocabulary; the model can use any phrasing justified by the README or resume text. Modern embeddings plus this enrichment allow broad queries like “what AI projects have you done?” to hit projects with varied wording.

#### 3.5.1 Cross-corpus linking

Cross-corpus linking connects projects to the jobs/experiences where they were built. This is done **manually via the gist**, not automatically.

**Design principle: Explicit is better than magic.** You know which projects you built at which company. Specify it directly in your `PortfolioRepoConfig` rather than relying on error-prone automatic matching.

**How it works:**

1. In your gist, add `linkedToCompanies` to each project:

```json
[
  {
    "repo": "you/payment-service",
    "projectId": "payment-service",
    "linkedToCompanies": ["Acme Corp"]
  },
  {
    "repo": "you/analytics-dashboard",
    "projectId": "analytics-dashboard",
    "linkedToCompanies": ["Acme Corp", "BigCo"]
  },
  {
    "repo": "you/side-project",
    "projectId": "side-project"
  }
]
```

2. Preprocessing extracts company names from your resume and outputs them:

```
$ pnpm preprocess

📋 Found experiences (use these exact company names in linkedToCompanies):
   • "Acme Corp" — Senior Engineer (2022-01 to present)
   • "BigCo" — Software Engineer (2020-03 to 2021-12)
   • "StartupCo" — Intern (2019-06 to 2019-08)
```

3. Preprocessing matches `linkedToCompanies` → experiences by **exact company name match** (case-insensitive):

```ts
function linkProjectsToExperiences(
  projects: PortfolioRepoConfig[],
  experiences: ExperienceRecord[],
  logger: Logger
): void {
  // Build company → experience lookup
  const companyToExperiences = new Map<string, ExperienceRecord[]>();
  for (const exp of experiences) {
    if (exp.kind !== 'experience') continue;
    const key = exp.company.toLowerCase().trim();
    const list = companyToExperiences.get(key) ?? [];
    list.push(exp);
    companyToExperiences.set(key, list);
  }

  // For each project with linkedToCompanies, find matching experiences
  for (const proj of projects) {
    if (!proj.linkedToCompanies?.length) continue;

    for (const companyName of proj.linkedToCompanies) {
      const key = companyName.toLowerCase().trim();
      const matchingExps = companyToExperiences.get(key);

      if (!matchingExps) {
        logger.warn(`No experience found for company "${companyName}" (project: ${proj.projectId})`);
        continue;
      }

      // Add this project to each matching experience's linkedProjects
      for (const exp of matchingExps) {
        exp.linkedProjects = exp.linkedProjects ?? [];
        if (!exp.linkedProjects.includes(proj.projectId)) {
          exp.linkedProjects.push(proj.projectId);
        }
      }
    }
  }
}
```

**Key points:**

- Use the **exact company name** from the preprocessing output
- Case-insensitive matching (so "Acme Corp" matches "acme corp")
- One project can link to multiple companies
- Projects without `linkedToCompanies` are treated as personal/unaffiliated

**Benefits:**

- Enumeration questions ("Which projects did you ship at Acme Corp?") use `linkedProjects` directly
- Narrative answers can tie employment history to concrete portfolio projects
- No threshold tuning, no embedding comparisons, no surprises
- You control exactly what links to what

### 3.6 Preprocessing Failure Modes

**Design principle: No silent failures.** The preprocessing pipeline fails loudly with clear error messages. No fallback documents or partial outputs—if something fails, fix it and retry.

This ensures:

- Developers see issues immediately during preprocessing
- Production data is always complete and properly enriched
- No degraded experiences reach end users

#### 3.6.1 Source Data Failures

| Failure                       | Behavior                                 | Error Code                    |
| ----------------------------- | ---------------------------------------- | ----------------------------- |
| **README empty or missing**   | Skip project; log warning with repo name | `PREPROCESS_EMPTY_README`     |
| **README too large** (>100KB) | Truncate to first 100KB; log warning     | `PREPROCESS_README_TRUNCATED` |
| **Resume PDF unreadable**     | Fail preprocessing with clear error      | `PREPROCESS_PDF_UNREADABLE`   |
| **Resume PDF empty/no text**  | Fail preprocessing with clear error      | `PREPROCESS_PDF_EMPTY`        |
| **Profile markdown missing**  | Fail preprocessing with clear error      | `PREPROCESS_PROFILE_REQUIRED` |
| **GitHub gist unreachable**   | Fail preprocessing with retry hint       | `PREPROCESS_GIST_UNAVAILABLE` |
| **GitHub repo not found**     | Skip project; log warning with repo name | `PREPROCESS_REPO_NOT_FOUND`   |

#### 3.6.2 LLM Enrichment Failures

**No silent failures or fallbacks.** If LLM enrichment fails, preprocessing fails with a clear error. Users should fix the issue and retry.

```ts
type PreprocessRetryConfig = {
  maxRetries: number; // default 3
  retryDelayMs: number; // default 1000
  retryBackoffMultiplier: number; // default 2
};

// No 'use_fallback' option - fail loudly or skip (with warning)
type PreprocessErrorAction = 'fail' | 'skip';
```

| Failure                  | Behavior                                   | Error Code                        |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| **LLM rate limit**       | Retry with backoff; fail after max retries | `PREPROCESS_LLM_RATE_LIMIT`       |
| **LLM timeout**          | Retry with backoff; fail after max retries | `PREPROCESS_LLM_TIMEOUT`          |
| **LLM invalid response** | Retry once; fail after retry               | `PREPROCESS_LLM_INVALID_RESPONSE` |
| **LLM refused content**  | Skip item with warning; log to metrics     | `PREPROCESS_LLM_REFUSED`          |

**No fallback documents.** If a project or resume entry cannot be properly enriched after retries:

1. Fail the entire preprocessing run (default), OR
2. Skip the item entirely (with `--skip-failures` flag) and log to metrics

This ensures that:

- Users see clear error messages when something goes wrong
- No degraded/partial content ends up in production
- Issues are addressed at preprocessing time, not discovered at runtime

#### 3.6.3 Embedding Failures

**No partial embeddings.** If embedding fails, preprocessing fails.

| Failure                          | Behavior                                               | Error Code                            |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| **Embedding API rate limit**     | Retry with exponential backoff; fail after max retries | `PREPROCESS_EMBED_RATE_LIMIT`         |
| **Embedding API timeout**        | Retry up to 3 times; fail after max retries            | `PREPROCESS_EMBED_TIMEOUT`            |
| **Embedding dimension mismatch** | Fail preprocessing (schema version mismatch)           | `PREPROCESS_EMBED_DIMENSION_MISMATCH` |

If any item fails to embed after retries, fail the entire preprocessing run. Do not produce partial embedding indexes.

#### 3.6.4 Validation & Consistency Checks

Before writing output artifacts, validate. **Validation failures are errors, not warnings.**

```ts
type PreprocessValidation = {
  // All three corpora are required for a complete portfolio
  hasProjects: boolean;
  hasResume: boolean;
  hasProfile: boolean;

  // Cross-reference checks
  linkedProjectsExist: boolean; // all ExperienceRecord.linkedProjects point to valid ProjectDoc.id
  corporaWithEmbeddingsComplete: boolean; // projects/resume embedding coverage required
};

function validatePreprocessOutput(validation: PreprocessValidation): void {
  // All three corpora are required - no fallbacks, no partial portfolios
  if (!validation.hasProjects) {
    throw new PreprocessError('PREPROCESS_NO_PROJECTS', 'No projects found. Add repos to your GitHub gist.');
  }

  if (!validation.hasResume) {
    throw new PreprocessError(
      'PREPROCESS_NO_RESUME',
      'No resume content found. Provide a resume PDF at the configured path.'
    );
  }

  if (!validation.hasProfile) {
    throw new PreprocessError(
      'PREPROCESS_PROFILE_REQUIRED',
      'Profile is required. Create data/chat/profile.md with your bio and details.'
    );
  }

  if (!validation.linkedProjectsExist) {
    throw new PreprocessError('PREPROCESS_INVALID_LINKS', 'Some linkedProjects reference non-existent project IDs');
  }

  if (!validation.corporaWithEmbeddingsComplete) {
    throw new PreprocessError('PREPROCESS_INCOMPLETE_EMBEDDINGS', 'Projects and resume must have embeddings');
  }
}
```

#### 3.6.5 Incremental Build

When `incrementalBuild: true`:

- Rebuild all corpora end-to-end (no hash-based reuse).
- If any corpus needs rebuilding, rebuild it completely (no partial updates)
- Validate all outputs before committing changes

---

## 4. Runtime Contracts & Types

### 4.1 Core Types & Reasoning

Appendix A is the single source of truth for: `PlannerLLMOutput` (queries/cards toggle/topic), `AnswerPayload` (message/thoughts/uiHints), `UiPayload`, `ModelConfig`, and the `ReasoningTrace` / `PartialReasoningTrace` shapes. ReasoningTrace is a structured dev trace (plan → retrieval → answerMeta); PartialReasoningTrace streams when reasoning is enabled and mirrors the three pipeline stages (`planner`, `retrieval`, `answer`).

### 4.2 Planner Output (`PlannerLLMOutput`)

- `queries`: array of `{ source: 'projects' | 'resume' | 'profile'; text: string; limit?: number }`.
- `cardsEnabled`: boolean (default true).
- `topic?`: short telemetry label for logging only.

Constraints and expectations:

- Queries may be empty for greetings/meta or when the latest turns already contain the necessary facts.
- `limit` defaults to 8 when omitted; runtime clamps to safe bounds.
- Queries should encode scope in text (e.g., “professional Go experience”, “AI/LLM projects”).
- Use `cardsEnabled = false` for rollups/counts or pure bio/meta asks where cards add no value.

### 4.3 AnswerPayload (combined)

- `message`: first-person text answer.
- `thoughts?`: optional dev-only trace.
- `uiHints?`: `{ projects?: string[]; experiences?: string[] }` ordered by relevance.

Constraints:

- uiHints IDs must be subsets of retrieved docs; invalid IDs are dropped during UI derivation.
- Omit uiHints (or leave arrays empty) when `cardsEnabled = false` or no cards are relevant.
- Order matters; the UI preserves the returned order.

### 4.4 UiPayload (derived from Answer.uiHints)

Simplified UI contract:

```ts
type UiPayload = {
  showProjects: string[];
  showExperiences: string[];
};
```

Rules:

- Always filter to retrieved doc IDs and clamp lengths (implementation default: 10 per type).
- When `cardsEnabled = false`, return empty arrays even if uiHints was present.
- No banner/core-evidence metadata; cards alone represent the UI surface.

### 4.5 Reasoning & Streaming Contract

- `reasoning` SSE events may contain partial text deltas and structured trace fragments: `{ stage: 'planner' | 'retrieval' | 'answer', trace, delta?, notes?, progress? }`.
- Stages stream cumulatively: planner (plan JSON), retrieval (per-query fetch progress + ranked summaries), answer (uiHints/metadata as soon as parsable plus token thinking).
- Final trace is emitted on stage completion; deltas are append-only text to show “what the model is thinking” during streaming.

### 4.6 Cross-Stage Invariants

- Cards toggle: `cardsEnabled = false` forces empty UiPayload; Answer should avoid card-facing language in that case.
- uiHints subset: Only IDs present in retrieved docs are allowed; drop/ignore hallucinated IDs.
- Retrieval reuse: If queries are empty, retrieval is skipped; Answer must honestly state when no relevant portfolio data is available.
- UI alignment: Cards shown must align with the textual answer; uiHints is the only source of truth for card IDs.

---

## 5. LLM Pipeline

Three-stage pipeline: Planner → Retrieval → Answer (Evidence merged into Answer).

All LLM interactions use the OpenAI Responses API with:

- `response_format: { type: "json_schema", json_schema: ... }` for Planner and Answer.
- Streaming enabled for Answer (and Planner JSON when supported), while capturing the final JSON.

### 5.0 Model Strategy

All runtime model IDs are read from `chat.config.yml`. We refer to them using placeholder class names: nano model (low cost/latency), mini model (deeper reasoning when needed), and full-size model (strongest quality).

- Offline (preprocess) – full-size model for enrichment & persona + text-embedding-3-large for embeddings.
- Online Planner – nano by default for cost/latency.
- Online Answer – nano or mini. Mini is recommended when voice examples are important, as it adheres to persona/voice guidelines more reliably than nano. Trade-off is slightly higher cost/latency.

#### 5.0.1 Token Budgets & Sliding Window

Sliding-window truncation keeps conversations going indefinitely while honoring per-stage token budgets. Clients generate stable `conversationId` per thread; the backend is stateless beyond the supplied messages.

| Stage       | Max Input Tokens | Max Output Tokens | Notes                                          |
| ----------- | ---------------- | ----------------- | ---------------------------------------------- |
| **Planner** | 16,000           | 1,000             | Sliding window + system prompt                 |
| **Answer**  | 16,000           | 2,000             | Sliding window + retrieved context + plan info |

Runtime defaults:

- Conversation window budget: ~8k tokens; always keep the last 3 turns.
- Max user message: ~500 tokens; reject if longer.
- Answer sees retrieved docs + planner output; Planner sees the windowed history.
- UI should surface a subtle "context truncated" hint when turns are dropped.
- Token counts are computed with tiktoken (o200k_base), not character-length heuristics.

Implementation details and the tokenizer guardrails live in `docs/features/chat/implementation-notes.md#21-sliding-window--token-budgets`.

### 5.0.2 Sliding Window Algorithm

The orchestrator uses tiktoken (`o200k_base` encoding) for token counting.

**Configuration:**

```ts
const SLIDING_WINDOW_CONFIG = {
  maxConversationTokens: 8000,
  minRecentTurns: 3,
  maxUserMessageTokens: 500,
};
```

**Algorithm:**

1. Group messages into turns (user + assistant pairs).
2. Validate the latest user message does not exceed `maxUserMessageTokens`; reject with `MessageTooLongError` if it does.
3. Working backwards from the most recent turn:
   - Always keep the last `minRecentTurns` turns regardless of token count.
   - Continue adding older turns while total tokens ≤ `maxConversationTokens`.
4. Return truncated messages and a `truncationApplied` flag.

**Error handling:**

- If the user message exceeds 500 tokens, return an error to the client before the pipeline runs.

### 5.1 Planner

- Purpose: Normalize the user's ask into search queries and a cards toggle.
- Model: `ModelConfig.plannerModel`.
- Inputs:
  - Planner system prompt from `pipelinePrompts.ts` with OwnerConfig/Persona placeholders resolved.
  - Conversation window (last ~3 user + 3 assistant messages).
  - Latest user message.
- Output:
  - `PlannerLLMOutput` JSON (`queries`, `cardsEnabled`, `topic?`).

**Responsibilities (from the simplified prompt)**

- Build targeted `queries` with explicit sources and key terms.
- Set `cardsEnabled` (default true) — false for rollups/counts, pure bio, or meta/greetings.
- Use empty `queries` for greetings/meta or when recent conversation suffices.
- Fill `topic` with a short telemetry label (2–5 words).

**Query construction & routing**

- Include key terms from the question; expand broad topics:
  - AI/ML: “AI, ML, machine learning, LLM”.
  - Frontend: “frontend, UI, UX, user interface”.
  - Backend: “backend, server, API, database”.
- Keep specific tools narrow (“Rust”, “Go”).
- Locations: include variants (“New York, NYC, NY”).
- Source guidance:
  - Skills/tools → `projects` + `resume`.
  - Employment → `resume`.
  - Projects → `projects`.
  - Bio/intro → `profile`.
  - Location → `profile` + `resume`.
- Default `limit` per query is 8 unless the model sets a lower/higher number within bounds.

**Cards toggle**

- `cardsEnabled = true` for most questions (project/experience cards are helpful).
- `cardsEnabled = false` for rollups (“What languages do you know?”), pure bio, or meta/greetings.

### 5.2 Retrieval

- Purpose: Execute planner queries and return scored document sets per source.
- Inputs:
  - PlannerLLMOutput.queries.
  - Corpora + embedding indexes (projects, resume) and the profile doc.
- Output:
  - Retrieved docs per source, scored and filtered for the Answer stage.

Processing steps:

- Deduplicate queries by `{ source, text.toLowerCase().trim() }`.
- Clamp `limit` into a safe range (implementation default: 3–10).
- BM25 shortlist → embedding re-rank → recency weighting → combined score.
- Profile is short-circuited (no embeddings) and included when requested or when the question is clearly bio/meta.
- Per-turn results may be reused when the same query repeats within the sliding window.
- Keep total retrieved docs bounded to avoid Answer prompt bloat (implementation default ~12 docs across sources).

**Query sanitization**

- Strip noise words from query text: `projects`, `project`, `experiences`, `experience`, `resume`.
- If sanitization yields an empty string, fall back to the original query.
- Prevents overly broad matches for asks like "show me your projects."

**Linked project resolution**

- Experiences that reference `linkedProjects` pull those projects alongside resume hits so employment-focused asks can still surface linked project cards.

### 5.3 Answer (cards-aware, evidence folded in)

- Purpose: Turn retrieval results into a grounded first-person answer and uiHints.
- Model: `ModelConfig.answerModel`.
- Inputs:
  - Answer system prompt from `pipelinePrompts.ts`.
  - Persona summary (PersonaSummary).
  - Identity context (OwnerConfig + ProfileDoc).
  - Conversation window.
  - Latest user message.
  - PlannerLLMOutput (cardsEnabled/topic).
  - Retrieved docs (projects, resume, profile).
- Output:
  - AnswerPayload JSON with optional uiHints.

**Behavior (per new prompt)**

- Grounding: only state facts from retrieved docs; if nothing relevant, say so (“I don’t have that in my portfolio”).
- Voice: speak as “I”; match persona voice/style guidelines and injected voice examples.
- UI hints: list relevant project/experience IDs (ordered) when cardsEnabled is true and cards are helpful; omit or leave arrays empty otherwise. Only include IDs present in retrieved docs.
- Answer length: keep text concise when cards are present; expand when no cards or few docs.
- Streaming: tokens stream; uiHints can surface as soon as valid JSON is parsable.

**Temperature**

- If `modelConfig.answerTemperature` is set, it controls response creativity. Lower values (0.3–0.5) produce more deterministic responses; higher values (0.8–1.0) allow more varied phrasing.

### 5.4 Meta, No‑Retrieval & Zero‑Result Behavior

- Empty `queries`: Skip retrieval; Answer uses profile/persona/context to respond (for greetings/meta) and returns empty uiHints.
- Retrieval but zero relevant docs: Answer states the gap transparently and leaves uiHints empty; UiPayload will be empty.
- Cards toggle: When `cardsEnabled = false`, Answer should avoid card-facing language and omit uiHints.

---

## 6. SSE API & Frontend Integration

### 6.0 Interaction Overview

![Portfolio Chat Engine - End-to-End Chat Turn Sequence](../../../generated-diagrams/portfolio-chat-sequence.png)

_Figure 6.0: End-to-end chat turn sequence showing the flow from user input through Planner, Retrieval, and Answer._

![Portfolio Chat Engine - Frontend SSE Event Handling](../../../generated-diagrams/portfolio-chat-sse-handling.png)

_Figure 6.1: Frontend SSE event handling flow showing how different SSE events are processed in the frontend._

### 6.1 Request

```ts
type ChatRequestMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string };

type ChatRequestPayload = {
  ownerId: string;
  conversationId: string; // client-generated stable ID per thread/tab
  messages: ChatRequestMessage[];
  responseAnchorId: string; // unique per attempt/retry
};
```

**Conversation & anchors**

- The backend does not persist sessions; the client generates a `conversationId` (e.g., UUID) per thread and reuses it for all turns until the user starts a new thread.
- `responseAnchorId` is unique per pipeline attempt, including retries. If a retry happens, mint a fresh `responseAnchorId` even if `conversationId` stays the same.
- `/api/chat` only serves the configured OwnerConfig; if `ownerId` in the payload does not match the configured owner, reject the request (400/403) rather than attempting multi-tenant routing.

### 6.2 SSE Events

Canonical event types (only these names are emitted):

| Event        | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `stage`      | Pipeline stage progress (`start` / `complete`)                 |
| `reasoning`  | Partial ReasoningTrace + optional text deltas per stage        |
| `ui`         | UiPayload updates derived from Answer.uiHints                  |
| `token`      | Streamed answer tokens                                         |
| `item`       | Reserved for non-token answer payloads (markdown blocks, etc.) |
| `attachment` | Host-defined downloadable payloads                             |
| `ui_actions` | Host-defined UI actions (e.g., highlight card)                 |
| `done`       | Stream completion + duration metadata                          |
| `error`      | Structured error once streaming has begun                      |

Each event is sent as an SSE `event:` name and JSON-encoded `data:` payload.

**Progressive Pipeline Streaming**

The pipeline streams updates as each stage starts and completes to reduce perceived latency.

```
[User sends message]
    ↓
stage: planner_start       ← "Planning..." indicator
reasoning: { stage: 'planner', notes: 'Planning…' } (optional delta)
    ↓ (200-400ms)
stage: planner_complete
reasoning: { stage: 'planner', trace: { plan: ... } }
    ↓
stage: retrieval_start     ← "Searching..." indicator
reasoning: { stage: 'retrieval', notes: 'Running query: resume "Go golang"' }
    ↓ (100-300ms)
stage: retrieval_complete
reasoning: { stage: 'retrieval', trace: { plan, retrieval: ... }, notes: 'Found 6 docs' }
    ↓
stage: answer_start        ← Typing indicator
token: "Yes"               ← Answer tokens stream
reasoning: { stage: 'answer', delta: 'thinking about uiHints...' } (optional)
    ↓
ui: { showProjects, showExperiences } (emitted when uiHints are known)
stage: answer_complete
done: {}
```

**Stage Events**

`stage` events fire at the start and end of each pipeline stage:

| Stage Event          | Timing           | UI Suggestion                                               |
| -------------------- | ---------------- | ----------------------------------------------------------- |
| `planner_start`      | Immediately      | "Understanding your question..."                            |
| `planner_complete`   | ~200-400ms       | Show detected topic/queries (e.g., "Searching: Go experience") |
| `retrieval_start`    | After planner    | "Searching portfolio..."                                    |
| `retrieval_complete` | ~100-300ms       | "Found X relevant items"                                    |
| `answer_start`       | After retrieval  | Typing indicator / cursor                                   |
| `answer_complete`    | After last token | Hide typing indicator                                       |

`reasoning` events stream incrementally as each stage progresses. Payloads may include `delta` text (append-only) plus structured trace fragments so dev tooling can show both a running transcript and the final trace.

### 6.3 UI Derivation (Answer‑Aligned)

Planner sets `cardsEnabled`; Answer returns `uiHints`. The UI layer derives cards strictly from Answer.uiHints filtered to retrieved docs.

Algorithm (buildUi):

1. If `cardsEnabled = false`, return `{ showProjects: [], showExperiences: [] }`.
2. Create sets of retrieved project and experience IDs.
3. Filter `answer.uiHints?.projects` / `answer.uiHints?.experiences` to retrieved IDs.
4. Clamp lengths (default max 10 per type).
5. Emit UiPayload. No banner/core-evidence metadata.

UI events can fire as soon as valid uiHints are available (during answer streaming or at completion).

### 6.4 SSE Event Payload Shapes

Logical payload shapes (actual wire format is JSON-encoded in `data:`):

- `stage`: `{ anchorId, stage: 'planner' | 'retrieval' | 'answer', status: 'start' | 'complete', meta?, durationMs? }` where meta can include `{ queries?, docsFound?, topic?, model? }`.
- `reasoning`: `{ anchorId, stage, trace?: PartialReasoningTrace, delta?: string, notes?: string, progress?: number }`.
- `token`: `{ anchorId, token }`.
- `ui`: `{ anchorId, ui: UiPayload }`.
- `item`, `attachment`, `ui_actions`: host-defined payloads keyed by `anchorId`.
- `done`: `{ anchorId, totalDurationMs, truncationApplied? }`.

**Frontend Stage Handling**

Client-side UI can switch on `event` to drive streaming text, UI cards, dev reasoning panels, and completion state. See `docs/features/chat/implementation-notes.md#42-stage-handling--progress-ui` for a concrete handler.

**Minimal vs Rich Progress UX**

| Mode         | Behavior                                                         |
| ------------ | ---------------------------------------------------------------- |
| **Minimal**  | Show generic "Thinking..." until first token                     |
| **Standard** | Show stage names: "Planning..." → "Searching..." → "Answering..." |
| **Rich**     | Show stage names + metadata: "Found 5 relevant projects"         |
| **Dev**      | Full reasoning trace panel with deltas and final trace           |

### 6.5 Streaming Error Recovery

**Design principle: No silent failures.** When something goes wrong at runtime, show the user a clear error and offer retry. Never silently swallow errors or show partial/degraded content without indication.

The SSE stream may fail due to network issues, OpenAI API errors, or server-side exceptions. Both backend and frontend must handle these explicitly. Failures caught before the first SSE event should return a normal JSON/HTTP response (no SSE). After streaming starts, any failure must emit an `error` SSE event before closing the connection.

#### 6.5.1 Error Event

When an error occurs mid-stream, the backend emits an `error` event before closing. Payload: `{ anchorId, code, message, retryable, retryAfterMs? }` where `code` is one of `llm_timeout | llm_error | retrieval_error | internal_error | stream_interrupted | rate_limited | budget_exceeded`.

#### 6.5.2 Backend Behavior

- **Planner failures:** Emit `error` event with `retryable: true`. Do not emit partial `token` events.
- **Retrieval failures:** Emit `error` with `code: 'retrieval_error'` and `retryable: true`.
- **Answer stream interruption:** If tokens have already been emitted, emit `error` with `code: 'stream_interrupted'` and `retryable: true`. The frontend should show what was received plus an error indicator.
- **Cost budget exceeded:** If the system is already over budget, short-circuit before streaming (JSON error such as `"Experiencing technical issues, try again later."`). If a turn pushes spend over the budget during streaming, the answer may finish streaming and then emit `error` with `code: 'budget_exceeded'` and `retryable: false`; subsequent turns are blocked by the preflight check.
- **Rate limiting:** Emit `error` with `code: 'rate_limited'`, `retryable: true`, and `retryAfterMs` from the `RateLimit-Reset` header.
- **Always emit `error` before closing:** Never leave the client hanging without an `error` or `done` event.

#### 6.5.3 Frontend Recovery

```ts
type StreamState = 'idle' | 'streaming' | 'error' | 'done';

// Retry loop: retryable errors back off (exponential with jitter) using a new responseAnchorId; keep conversationId stable.
```

See `docs/features/chat/implementation-notes.md#43-streaming-error-backoff` for the helper implementation.

#### 6.5.4 Partial Answer Handling

If the Answer stage fails after emitting some tokens:

- Backend: Emit `error` event with `code: 'stream_interrupted'`.
- Frontend: Display received tokens + error indicator (e.g., "Response interrupted. [Retry]").
- On retry: Clear partial tokens and restart from Planner (fresh responseAnchorId).

---

## 7. Safety, Grounding & Moderation

- **UI‑Answer consistency**
  - Cards must not visually suggest capabilities that contradict the text answer.
  - Answer.uiHints is the single source of truth for which cards are relevant (filtered to retrieved docs).
- **Prompt injection resistance**
  - Portfolio documents are treated as data, not instructions.
  - Prompts for Planner / Answer explicitly instruct models to ignore instructions embedded in documents.
- **Moderation**
  - Input moderation is enabled by default in the Next.js route; flagged inputs short-circuit with a brief, non-streamed refusal (HTTP 200 is acceptable).
  - Output moderation is also enabled by default in the current route; refusals are non-streamed with the configured refusal message/banner. Adjust route options if you want it disabled.

> **Implementation note:** Moderation hooks live in the Next.js `/api/chat` route. The orchestrator focuses on Planner → Retrieval → Answer and assumes inputs are already moderated.

---

## 8. Observability, Metrics & Evals

### 8.1 Preprocessing Metrics

chat-preprocess-cli wraps every OpenAI call with PreprocessMetrics, recording model, tokens, and USD estimate per stage. Each run writes:

- `generated/metrics/preprocess-<runId>.json`
- A stage‑by‑stage summary to stdout.

### 8.2 Runtime Logging & Metrics

Per chat turn, log:

- LLM usage per stage (model, tokens, cost).
- **Planner:**
  - queries (source/text/limit), cardsEnabled, topic.
  - planner model + reasoning effort when set.
- **Retrieval:**
  - For each query: source, queryText, requestedLimit, effectiveLimit, numResults.
  - Cache hit/miss info and retrieval latency per source.
- **Answer:**
  - uiHints.projects.length, uiHints.experiences.length.
  - cardsEnabled flag and whether uiHints were emitted early.
  - Length of final message and presence/size of thoughts.
  - TTFT and total streaming duration.
- **SSE:**
  - Time to first reasoning delta and first token.
  - Whether ui payload was emitted during streaming or at completion.

### 8.3 Debug vs User Mode (Reasoning Emission)

- Reasoning is emitted only when the integrator requests it per run (`reasoningEnabled`).
- No environment-based defaults: both dev and prod must explicitly request reasoning.
- The chat engine exposes reasoning as structured stream/state but does not define end‑user UX for it; any reasoning UI (panel, toggle, separate page) is built by the host app.
- Stage values are `planner`, `retrieval`, and `answer`; deltas may be present in addition to structured trace fragments.

### 8.4 Evals & Graders (cards-aware)

Coverage focuses on grounding, UI/text alignment, cards toggle behavior, zero-result honesty, and persona adherence. See `docs/features/chat/evals-and-goldens.md` for the active suites and runner sketch.

### 8.5 Chat Eval Sets

Chat evals validate end-to-end behavior. Schema (source of truth lives in `docs/features/chat/evals-and-goldens.md`):

```ts
type ChatEvalTestCase = {
  id: string;
  name: string;
  category: 'skill' | 'projects' | 'experience' | 'bio' | 'meta' | 'edge_case';
  input: { userMessage: string; conversationHistory?: ChatMessage[] };
  expected?: {
    cardsEnabled?: boolean;
    plannerQueries?: Array<{ source?: PlannerQuerySource; textIncludes?: string[]; limitAtMost?: number }>;
    answerContains?: string[];
    answerNotContains?: string[];
    uiHintsProjectsMinCount?: number;
    uiHintsProjectsMaxCount?: number;
    uiHintsExperiencesMinCount?: number;
    uiHintsExperiencesMaxCount?: number;
    mustIncludeProjectIds?: string[];
    mustIncludeExperienceIds?: string[];
    mustNotIncludeProjectIds?: string[];
  };
};

type ChatEvalSuite = {
  name: string;
  description: string;
  tests: ChatEvalTestCase[];
};
```

Example (trimmed):

```ts
const factCheckSuite: ChatEvalSuite = {
  name: 'Fact Check',
  description: 'Binary capability questions',
  tests: [
    {
      id: 'fc-yes-react',
      name: 'Skill affirmative',
      category: 'skill',
      input: { userMessage: 'Have you used React?' },
      expected: {
        cardsEnabled: true,
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'fc-no-evidence-rust',
      name: 'Skill absent',
      category: 'skill',
      input: { userMessage: 'Have you used Rust?' },
      expected: {
        uiHintsProjectsMaxCount: 0,
        answerContains: ["I don't have that in my portfolio"],
      },
    },
  ],
};
```

Full chat eval suites and runner sketch: `docs/features/chat/evals-and-goldens.md`; suites live in `tests/golden/index.ts`.

---

## 9. Implementation & Packaging Notes

### 9.1 Monorepo Layout

- data/chat/ – source resume PDF, profile markdown.
- generated/ – preprocess outputs: persona/profile enrichments, embeddings, indexes, metrics.
- packages/chat-contract – shared contracts.
- packages/chat-data – retrieval/search utilities.
- packages/chat-orchestrator – Planner→Retrieval→Answer runtime.
- packages/chat-next-api – Next.js API route.
- packages/chat-next-ui – Exports React hooks (e.g., usePortfolioChat with messages, uiPayload, reasoningTrace, loading state); consumers render their own UI components.
- packages/chat-preprocess-cli – CLI for preprocessing.
- packages/github-data – GitHub integration.
- Next.js app + UI live in `src/` with:
  - `chat.config.yml` (runtime defaults).
  - `chat-preprocess.config.yml` (preprocess defaults).

### 9.2 Runtime wiring (createChatApi → createChatRuntime)

The Next.js `/api/chat` route uses `createChatApi` (packages/chat-next-api), which wraps `createChatRuntime` with repositories + semantic rankers. Usage:

```ts
type RunOptions = {
  ownerId?: string;
  reasoningEnabled?: boolean; // emit reasoning only when true
  onAnswerToken?: (token: string) => void;
  onUiUpdate?: (ui: UiPayload) => void;
  onReasoningUpdate?: (trace: PartialReasoningTrace) => void;
};

const chatApi = createChatApi({
  retrieval: {
    projectRepository,
    experienceRepository,
    profileRepository,
    projectSemanticRanker,
    experienceSemanticRanker,
  },
  runtimeOptions: {
    owner: ownerConfig,
    modelConfig,
    persona,
    identityContext,
  },
});

chatApi.run(openaiClient, messages, {
  ownerId: ownerConfig.ownerId,
  reasoningEnabled, // controls whether reasoning SSE + callbacks emit
  onAnswerToken,
  onUiUpdate,
  onReasoningUpdate,
});
```

- Reasoning is emitted only when `reasoningEnabled` is true; there is no environment-based default.

### 9.3 Model Tiering & Config

- ModelConfig controls planner/answer/embedding models.
- Defaults live in chat.config.yml.
- `pipelinePrompts.*` contains the prompts used by createChatRuntime.
- chat-contract schemas define PlannerLLMOutput, AnswerPayload with uiHints, UiPayload, and shared enums used across runtime.

### 9.4 Metrics Helper

- PreprocessMetrics.wrapLlm wraps OpenAI calls during preprocessing, capturing usage/cost plus optional meta per stage.
- Runtime logging uses an optional logger passed to createChatRuntime.

---

## 10. Future Extensions

- Richer evals:
  - Streaming order/latency checks for planner/retrieval/answer deltas.
  - UI alignment checks for uiHints vs text when cardsEnabled toggles.
- Additional UI actions via ui_actions SSE events:
  - e.g. highlightCard, scrollToTimeline, filterByTag.

### 10.1 LLM-aware retrieval knobs

- Extend PlannerLLMOutput.queries with optional retrieval hints:
  - e.g. `aggressiveness: 'strict' | 'balanced' | 'high_recall'`.
- Allow the Planner to:
  - Request stricter vs looser retrieval beyond default limits.
  - Bias more heavily toward recent experiences for certain queries ("latest work with X").

---

## Appendix A – Schemas (Planner, Answer)

TypeScript-style schemas reflecting the simplified three-stage pipeline and uiHints-driven UI.

```ts
// ================================
// Core enums / string unions
// ================================

export type PlannerQuerySource = 'projects' | 'resume' | 'profile';

// ================================
// Planner → PlannerLLMOutput
// ================================

export interface PlannerQuery {
  source: PlannerQuerySource;
  text: string; // search query text
  limit?: number; // optional, default 8
}

export interface PlannerLLMOutput {
  queries: PlannerQuery[];
  cardsEnabled: boolean;
  topic?: string;
}

// ================================
// Answer stage → AnswerPayload
// ================================

export interface AnswerPayload {
  /**
   * User-facing message in first person ("I...").
   * Typically short when cards are present; longer narrative when cards are absent.
   */
  message: string;

  /**
   * Optional dev-only chain-of-thought / rationale.
   * Not shown to end users.
   */
  thoughts?: string[];

  /**
   * Optional uiHints to drive cards.
   */
  uiHints?: {
    projects?: string[];
    experiences?: string[];
  };
}

// ================================
// UI payload (derived from Answer)
// ================================

export interface UiPayload {
  /**
   * Ordered list of project IDs to render as cards.
   * Derived from Answer.uiHints filtered to retrieved IDs.
   * Empty array when cardsEnabled=false or no relevant projects were found.
   */
  showProjects: string[];

  /**
   * Ordered list of resume experience IDs to render as cards.
   * Derived from Answer.uiHints filtered to retrieved IDs.
   * Empty array when cardsEnabled=false or no relevant experiences were found.
   */
  showExperiences: string[];
}

// ================================
// Reasoning trace (dev-only)
// ================================

export interface ReasoningTrace {
  plan?: PlannerLLMOutput;
  retrieval?: {
    query: PlannerQuery;
    fetched: number;
    total?: number;
    topHits?: { id: string; source: PlannerQuerySource; score?: number }[];
  }[];
  answer?: {
    model: string;
    uiHints?: AnswerPayload['uiHints'];
    cardsEnabled: boolean;
  };
  truncationApplied?: boolean;
}

export type PartialReasoningTrace = Partial<ReasoningTrace>;
```

### A.1 Sample Planner Outputs

```json
// Skill question
{
  "queries": [
    { "source": "resume", "text": "Go golang", "limit": 6 },
    { "source": "projects", "text": "Go golang backend", "limit": 6 }
  ],
  "cardsEnabled": true,
  "topic": "Go experience"
}

// AI experience
{
  "queries": [
    { "source": "resume", "text": "AI ML machine learning LLM PyTorch TensorFlow" },
    { "source": "projects", "text": "AI ML machine learning LLM" }
  ],
  "cardsEnabled": true,
  "topic": "AI experience"
}

// Greeting
{
  "queries": [],
  "cardsEnabled": false,
  "topic": "greeting"
}
```

### A.2 Sample AnswerPayloads

```json
{
  "message": "Yep—I’ve used Go in production. At Datadog I built Go microservices, and I also shipped a personal Go service.",
  "uiHints": {
    "projects": ["proj_go_service"],
    "experiences": ["exp_datadog_2022"]
  }
}

{
  "message": "Hi! I’m James. Ask me about my projects or experience whenever you’re ready.",
  "uiHints": {}
}
```

### A.3 Sample UiPayload (derived)

```json
{
  "showProjects": ["proj_go_service"],
  "showExperiences": ["exp_datadog_2022"]
}
```
