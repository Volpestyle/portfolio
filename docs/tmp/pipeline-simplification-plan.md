# Pipeline Simplification Plan

**Goal:** Reduce 4-stage pipeline (Planner → Retrieval → Evidence → Answer) to 3-stage (Planner → Retrieval → Answer) by eliminating the Evidence stage and simplifying schemas.

**Expected Gains:**

- ~250ms latency reduction (one fewer LLM call)
- ~40% less code complexity
- ~70% smaller output schemas
- Easier debugging (fewer moving parts)

---

## Phase 1: Schema Simplification

### 1.1 Simplify Planner Output

**Current (`PlannerLLMOutput`):**

```ts
type PlannerLLMOutput = {
  questionType: QuestionType;
  enumeration: EnumerationMode;
  scope: ExperienceScope;
  retrievalRequests: RetrievalRequest[];
  resumeFacets?: ResumeFacet[];
  cardsEnabled?: boolean;
  topic?: string | null;
};
```

**New (`PlannerLLMOutput`):**

```ts
type PlannerLLMOutput = {
  // Retrieval instructions
  queries: Array<{
    source: 'projects' | 'resume' | 'profile';
    text: string;
    limit?: number; // optional, default 8
  }>;

  // UI hint
  cardsEnabled: boolean;

  // Telemetry (optional)
  topic?: string;
};
```

**Removed:**

- `questionType` — Answer model infers this from the question
- `enumeration` — Answer model decides how many to show
- `scope` — Can be embedded in query text ("professional Go experience")
- `resumeFacets` — Simplify to just searching resume

**Files to modify:**

- `packages/chat-contract/src/index.ts`
- `packages/chat-orchestrator/src/pipelinePrompts.ts` — Simplify planner prompt

---

### 1.2 Simplify Answer Output

**Current (`AnswerPayload` + `EvidenceSummary`):**

```ts
// Evidence stage output
type EvidenceSummary = {
  verdict: Verdict;
  confidence: Confidence;
  reasoning: string;
  selectedEvidence: EvidenceItem[];
  semanticFlags?: SemanticFlag[];
  uiHints?: EvidenceUiHints;
  uiHintWarnings?: UiHintValidationWarning[];
};

// Answer stage output
type AnswerPayload = {
  message: string;
  thoughts?: string[];
};
```

**New (combined `AnswerPayload`):**

```ts
type AnswerPayload = {
  message: string;
  thoughts?: string[];
  uiHints?: {
    projects?: string[]; // IDs from retrieved docs to show as cards
    experiences?: string[]; // IDs from retrieved docs to show as cards
  };
};
```

**Removed:**

- `verdict`, `confidence` — Implicit in answer tone
- `reasoning` — Internal; not needed
- `selectedEvidence` — Redundant with `uiHints`
- `semanticFlags` — Answer handles naturally
- `thoughts` — Optional dev field, can add back later if needed

**Files to modify:**

- `packages/chat-contract/src/index.ts` — Update `AnswerPayload`

---

### 1.3 Simplify UiPayload

**Current:**

```ts
type UiPayload = {
  showProjects: string[];
  showExperiences: string[];
  bannerText?: string;
  coreEvidenceIds?: string[];
};
```

**New:**

```ts
type UiPayload = {
  showProjects: string[];
  showExperiences: string[];
};
```

**Removed:**

- `bannerText`
- `coreEvidenceIds` — Was for highlighting "key" evidence; uiHints already orders by relevance

**Files to modify:**

- `packages/chat-contract/src/index.ts` — Update `UiPayload`

---

## Phase 2: Prompt Rewrite

### 2.1 New Planner Prompt

**File:** `packages/chat-orchestrator/src/pipelinePrompts.ts`

```ts
export const plannerSystemPrompt = `
# Planner — Portfolio Chat

You decide what to search for to gather supporting evidence, if needed, for replies to messages or questions about {{OWNER_NAME}}'s portfolio.

## Output Format
Return JSON:
{
  "queries": [
    { "source": "projects", "text": "search query here" },
    { "source": "resume", "text": "search query here" }
  ],
  "cardsEnabled": true,
  "topic": "short topic label"
}

## Sources
- \`projects\` — GitHub repos, side projects, work projects
- \`resume\` — Jobs, internships, education, skills, awards
- \`profile\` — Bio, location, current role, social links

## Guidelines

### Query Construction
- Include key terms from the question
- For broad topics (AI, frontend, backend), expand as follows:
  - "AI, ML, machine learning, LLM"
  - "frontend, UI, UX, user interface"
  - "backend, server, API, database"
- For specific tools (Rust, Go), keep narrow: "Rust"
- For locations, include variants: "New York, NYC, NY"

### When to Search What
| Question Type | Sources |
|---------------|---------|
| Skills/tools ("Have you used X?") | projects + resume |
| Employment ("Where have you worked?") | resume |
| Projects ("Show me your work") | projects |
| Bio/intro ("Tell me about yourself") | profile |
| Location ("Where are you based?") | profile + resume |

### Cards Toggle
- \`cardsEnabled: true\` — Most questions (show relevant project/experience cards)
- \`cardsEnabled: false\` — Rollups ("What languages do you know?"), pure bio, meta/greetings

### Meta Questions
For greetings ("hi", "yo") or questions about the chat itself:
- Return empty queries: \`"queries": []\`
- Set \`cardsEnabled: false\`

## Examples

User: "Have you used Go professionally?"
{
  "queries": [
    { "source": "resume", "text": "Go golang" },
  ],
  "cardsEnabled": true,
  "topic": "Go professional experience"
}

User: "What AI stuff have you done?"
{
  "queries": [
    { "source": "resume", "text": "AI ML machine learning LLM PyTorch TensorFlow OpenAI" },
    { "source": "projects", "text": "AI ML machine learning LLM" PyTorch TensorFlow OpenAI" },
  ],
  "cardsEnabled": true,
  "topic": "AI experience"
}


User: "Have you been to Berlin?"
{
  "queries": [
    { "source": "resume", "text": "Berlin Germany Europe" },
    { "source": "profile", "text": ""},
  ],
  "cardsEnabled": true,
  "topic": "Travel"
}

User: "What languages have u used?"
{
  "queries": [
    { "source": "resume", "text": "skills languages frameworks" },
    { "source": "profile", "text": "" }
  ],
  "cardsEnabled": false,
  "topic": "skills"
}

User: "hey"
{
  "queries": [],
  "cardsEnabled": false,
  "topic": "greeting"
}
`.trim();
```

---

### 2.2 New Answer Prompt

**File:** `packages/chat-orchestrator/src/pipelinePrompts.ts`

```ts
export const answerSystemPrompt = `
# Answer — Portfolio Chat

You are {{OWNER_NAME}}, a {{DOMAIN_LABEL}}. Answer questions about your portfolio using the retrieved documents.

## Rules

### Grounding
- ONLY state facts from the retrieved documents
- If no relevant docs, say so honestly: "I don't have that in my portfolio" or similar
- Never invent projects, jobs, skills, or experiences

### Voice
- Speak as "I" (first person)
- Match the tone of the voice examples below
- Follow the style guidelines below

### UI Hints
- In \`uiHints\`, list IDs of relevant projects/experiences to show as cards
- Only include IDs that appear in the retrieved documents
- Order by relevance (most relevant first)
- If no cards are relevant or cardsEnabled=false, omit uiHints or leave arrays empty

### Answer Length
- Let the UI cards speak, supply minimal outline or narrative
- If no UI cards, feel free to provide longer response 

## Output Format
Return JSON:
{
  "message": "Your answer here...",
  "thoughts": ["Thought 1", "Thought 2", "Thought 3"]
  "uiHints": {
    "projects": ["project-id-1", "project-id-2"],
    "experiences": ["experience-id-1"]
  }
}

If no cards needed:
{
  "message": "Your answer here..."
  "thoughts": ["Thought 1", "Thought 2", "Thought 3"]
}
`.trim();
```

---

### 2.3 Voice Examples Injection

Keep the existing voice example injection logic from `buildAnswerSystemPrompt()`:

```ts
export function buildAnswerSystemPrompt(persona?: PersonaSummary, owner?: OwnerConfig): string {
  const sections: string[] = [];

  if (persona?.voiceExamples?.length) {
    sections.push(
      ['## Voice Examples\nMatch this tone:', ...persona.voiceExamples.map((example) => `- ${example}`)].join('\n')
    );
  }

  sections.push(applyOwnerTemplate(answerSystemPrompt, owner));

  if (persona?.styleGuidelines?.length) {
    sections.push(['## Style Guidelines', ...persona.styleGuidelines.map((rule) => `- ${rule}`)].join('\n'));
  }

  return sections.join('\n\n');
}
```

---

## Phase 2.5: Streaming All Stages

**Goal:** Stream every stage’s thinking into the reasoning panel in real time. Answer keeps token streaming; evidence is merged into Answer, but we still surface “how I’m deciding” as it streams.

### 2.5.1 Unify Stage Streaming Contract

- Keep existing `reasoning` SSE event type; extend payload to allow partial text per stage: `{ stage, trace, notes?: string, delta?: string, progress?: number }`.
- Use `stage` values aligned to the simplified pipeline: `planner`, `retrieval`, `answer`.
- Normalize deltas so UI can treat `delta` as “append this text” while still receiving structured `trace`.

### 2.5.2 Planner Streaming

- Switch planner call to streaming JSON (same pattern as Answer) and tap `onTextDelta` to emit `reasoning` events containing the running draft (sanitize to avoid leaking invalid JSON downstream).
- Emit early “planning…” notes immediately on stage start, then accumulate deltas until final plan is validated; keep final `trace.plan` unchanged.
- Surface token rate to measure TTFT impact.

### 2.5.3 Retrieval Streaming

- Emit `reasoning` events as each query executes: `{ query, source, fetched: n, total?: n }`.
- After dedupe/ranking, stream a short summary of top hits per query (title + score) into `notes` to show progress.
- Keep final `trace.retrieval` as the authoritative summary when the stage completes.

### 2.5.4 Answer (Evidence Merged) Streaming

- Answer already streams tokens; add optional `reasoning` deltas when the model emits “thinking” or when uiHints become known (e.g., after first valid JSON chunk containing `uiHints`).
- Ensure uiHints can be emitted to UI as soon as they parse, not only at the end, while keeping the JSON validator strict for the final payload.

### 2.5.5 SSE + UI Changes

- Server: forward the new `reasoning` deltas without throttling; preserve existing stage start/complete events.
- UI: accumulate `delta` text per stage in the reasoning panel while continuing to replace the structured `trace` when stage completes; show a spinner only when no delta has arrived yet.
- Add small debounce (e.g., 50–75ms) client-side to avoid over-rendering during fast bursts.

### 2.5.6 Validation

- Add lightweight integration test: simulate planner and retrieval streaming events and assert reasoning panel stores deltas in order and resolves to the final trace on `done`.
- Measure: time to first reasoning delta (<400ms target) and ensure answer token TTFT does not regress.

---

## Phase 2.6: Reasoning Panel Animation Overhaul

**Goal:** Create an elegant, polished animation experience for the reasoning panel that makes streaming feel alive without being distracting. The panel should feel like a "window into the AI's thinking" rather than a static status display.

### 2.6.1 Design Principles

1. **Progressive Disclosure** — Reveal content as it arrives, not all at once
2. **Ambient Activity** — Show something is happening even before text arrives
3. **Smooth Transitions** — No jarring state changes; everything flows
4. **Performance First** — Animations must not block main thread or cause jank

### 2.6.2 Stage-Aware Loading States

Replace current spinner with stage-specific ambient animations:

**Planner Stage:**
```tsx
// Pulsing "neurons" that connect and fire
<motion.div className="flex gap-1">
  {[0, 1, 2].map((i) => (
    <motion.div
      key={i}
      className="h-1.5 w-1.5 rounded-full bg-blue-400"
      animate={{
        scale: [1, 1.4, 1],
        opacity: [0.4, 1, 0.4],
      }}
      transition={{
        duration: 0.8,
        delay: i * 0.15,
        repeat: Infinity,
      }}
    />
  ))}
</motion.div>
```

**Retrieval Stage:**
```tsx
// Scanning line that sweeps across a mini-grid
<motion.div className="relative h-4 w-16 overflow-hidden rounded bg-white/5">
  <motion.div
    className="absolute inset-y-0 w-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
    animate={{ x: [0, 64, 0] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
  />
</motion.div>
```

**Answer Stage:**
```tsx
// Typewriter cursor blink (matches answer typewriter)
<motion.span
  className="inline-block h-3 w-0.5 bg-blue-400"
  animate={{ opacity: [1, 0, 1] }}
  transition={{ duration: 0.8, repeat: Infinity }}
/>
```

### 2.6.3 Token Stream Reveal Animation

When streaming text arrives, reveal it with a subtle "fade-slide" effect:

```tsx
interface StreamingTextProps {
  text: string;
  isComplete: boolean;
}

function StreamingText({ text, isComplete }: StreamingTextProps) {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    if (text.length > displayedLength) {
      // Batch reveals for performance (reveal 3-5 chars at a time)
      const timer = setTimeout(() => {
        setDisplayedLength(Math.min(displayedLength + 4, text.length));
      }, 16); // ~60fps
      return () => clearTimeout(timer);
    }
  }, [text, displayedLength]);

  const revealed = text.slice(0, displayedLength);
  const pending = text.slice(displayedLength);

  return (
    <span className="relative">
      <span className="text-white/80">{revealed}</span>
      {!isComplete && pending && (
        <motion.span
          className="text-white/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
        >
          {pending.slice(0, 20)}...
        </motion.span>
      )}
      {!isComplete && (
        <motion.span
          className="ml-0.5 inline-block h-3 w-0.5 bg-blue-400"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}
```

### 2.6.4 Section Expansion Animation

When a new reasoning section appears (e.g., retrieval starts after planning completes):

```tsx
<motion.div
  initial={{ height: 0, opacity: 0, y: -8 }}
  animate={{ height: "auto", opacity: 1, y: 0 }}
  transition={{
    height: { duration: 0.3, ease: "easeOut" },
    opacity: { duration: 0.2, delay: 0.1 },
    y: { duration: 0.3, ease: "easeOut" },
  }}
>
  <ReasoningSection ... />
</motion.div>
```

### 2.6.5 Completion Flourish

When a stage completes, add a subtle "success" flourish:

```tsx
// Icon morphs from loading state to checkmark/icon
<AnimatePresence mode="wait">
  {isLoading ? (
    <motion.div
      key="loading"
      exit={{ scale: 0, rotate: 90 }}
      transition={{ duration: 0.15 }}
    >
      <LoadingDots />
    </motion.div>
  ) : (
    <motion.div
      key="done"
      initial={{ scale: 0, rotate: -90 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <CheckIcon className="h-4 w-4 text-green-400" />
    </motion.div>
  )}
</AnimatePresence>
```

### 2.6.6 Progress Indicator (Header)

Add an elegant progress arc in the panel header that fills as stages complete:

```tsx
interface ProgressArcProps {
  progress: number; // 0-1
  isStreaming: boolean;
}

function ProgressArc({ progress, isStreaming }: ProgressArcProps) {
  const circumference = 2 * Math.PI * 6; // r=6
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
      {/* Background circle */}
      <circle
        cx="8" cy="8" r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-white/10"
      />
      {/* Progress arc */}
      <motion.circle
        cx="8" cy="8" r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ strokeDashoffset }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="text-blue-400"
      />
      {/* Pulsing dot at leading edge when streaming */}
      {isStreaming && (
        <motion.circle
          cx="8" cy="2" r="1.5"
          fill="currentColor"
          className="text-blue-400"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{
            transformOrigin: "8px 8px",
            rotate: `${progress * 360}deg`,
          }}
        />
      )}
    </svg>
  );
}
```

**Progress mapping:**
| Stage | Progress |
|-------|----------|
| Not started | 0.0 |
| Planning | 0.15 |
| Planning complete | 0.33 |
| Retrieving | 0.45 |
| Retrieval complete | 0.66 |
| Answering | 0.80 |
| Complete | 1.0 |

### 2.6.7 Collapsed State Enhancement

When the panel is collapsed but streaming, show a subtle "activity pulse" on the header:

```tsx
{!isExpanded && isStreaming && (
  <motion.div
    className="absolute inset-0 rounded-lg"
    animate={{
      boxShadow: [
        "inset 0 0 0 1px rgba(96, 165, 250, 0)",
        "inset 0 0 0 1px rgba(96, 165, 250, 0.3)",
        "inset 0 0 0 1px rgba(96, 165, 250, 0)",
      ],
    }}
    transition={{ duration: 2, repeat: Infinity }}
  />
)}
```

### 2.6.8 Implementation Files

**Update:**
- `src/components/chat/ChatReasoningPanel.tsx` — Add streaming text reveal, stage-aware loaders, progress arc
- `src/components/chat/ChatReasoningDisplay.tsx` — Pass streaming deltas to panel

**New (optional):**
- `src/components/chat/ReasoningAnimations.tsx` — Extract reusable animation primitives (StreamingText, ProgressArc, StagePulse)

### 2.6.9 Performance Considerations

1. **Use `will-change: transform, opacity`** on animated elements to hint GPU acceleration
2. **Batch state updates** — Accumulate deltas in a ref and flush to state at 60fps max
3. **Virtualize long reasoning** — If a stage produces 100+ lines, only render visible portion
4. **Disable animations on `prefers-reduced-motion`** — Fall back to instant reveals

```tsx
const prefersReducedMotion = useReducedMotion();

// In animation components
transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
```

### 2.6.10 Accessibility

- All animated loaders include `aria-busy="true"` and `aria-live="polite"`
- Streaming text has `aria-label` describing current stage
- Progress arc has `role="progressbar"` with `aria-valuenow`
- Reduced motion users see static indicators with text status

---

## Phase 3: Pipeline Code Changes

### 3.1 Remove Evidence Stage

**File:** `packages/chat-orchestrator/src/runtime/pipeline.ts`

**Remove:**

- `summarizeEvidence()` function
- `buildEvidenceUserContent()` function
- `normalizeEvidenceSummaryPayload()` function
- `buildEvidenceCandidates()` function
- `synthesizeEvidenceSummary()` function
- All `EvidenceSummary` handling
- Evidence-related constants (`MAX_SELECTED_EVIDENCE`, etc.)
- Evidence stage timing/logging

**Keep:**

- `planRetrieval()` — Adapt for new `PlannerLLMOutput` schema
- `executeRetrievalPlan()` — Adapt for new query format
- `generateAnswerPayload()` — Adapt for new combined role
- `buildUiArtifacts()` — Simplify to just use `answer.uiHints`

---

### 3.2 Simplify `createChatRuntime`

**Current flow in `run()`:**

```ts
// 1. Plan
const plan = await planRetrieval(...);

// 2. Retrieve
const retrieved = await executeRetrievalPlan(...);

// 3. Evidence
const evidence = await summarizeEvidence(...);

// 4. Answer
const answer = await generateAnswerPayload({ ..., evidence });

// 5. Build UI from evidence
const ui = buildUiArtifacts({ plan, evidence, ... });
```

**New flow:**

```ts
// 1. Plan
const plan = await planRetrieval(...);

// 2. Retrieve
const retrieved = await executeRetrieval(plan);

// 3. Answer (includes uiHints)
const answer = await generateAnswer({
  userMessage,
  plan,
  retrieved,
  persona,
  onToken,
});

// 4. Build UI from answer.uiHints
const ui = buildUi(answer.uiHints, retrieved);
```

---

### 3.3 Simplify `buildUiArtifacts()`

**Current:** Complex logic handling evidence, enumeration modes, fallbacks

**New:**

```ts
function buildUi(uiHints: AnswerPayload['uiHints'], retrieved: RetrievalResult, cardsEnabled: boolean): UiPayload {
  if (!cardsEnabled) {
    return { showProjects: [], showExperiences: [] };
  }

  const retrievedProjectIds = new Set(retrieved.projects.map((p) => p.id));
  const retrievedExperienceIds = new Set(retrieved.experiences.map((e) => e.id));

  // Filter to only IDs that exist in retrieved docs
  const showProjects = (uiHints?.projects ?? []).filter((id) => retrievedProjectIds.has(id)).slice(0, 10);

  const showExperiences = (uiHints?.experiences ?? []).filter((id) => retrievedExperienceIds.has(id)).slice(0, 10);

  const bannerText =
    showProjects.length === 0 && showExperiences.length === 0 && cardsEnabled
      ? 'No matching portfolio items found.'
      : undefined;

  return { showProjects, showExperiences, bannerText };
}
```

---

### 3.4 Simplify Answer User Content

**Current:** Complex with plan summary, evidence counts, cards gate

**New:**

```ts
function buildAnswerUserContent(input: {
  userMessage: string;
  conversationSnippet: string;
  plan: PlannerLLMOutput;
  retrieved: RetrievalResult;
}): string {
  const { userMessage, conversationSnippet, plan, retrieved } = input;

  return [
    `## Conversation`,
    conversationSnippet,
    '',
    `## Latest Question`,
    userMessage,
    '',
    `## Retrieved Projects (${retrieved.projects.length})`,
    JSON.stringify(
      retrieved.projects.map((p) => ({
        id: p.id,
        name: p.name,
        oneLiner: p.oneLiner,
        techStack: p.techStack,
        bullets: p.bullets?.slice(0, 3),
      })),
      null,
      2
    ),
    '',
    `## Retrieved Experiences (${retrieved.experiences.length})`,
    JSON.stringify(
      retrieved.experiences.map((e) => ({
        id: e.id,
        company: e.company,
        title: e.title,
        location: e.location,
        skills: e.skills,
        bullets: e.bullets?.slice(0, 3),
      })),
      null,
      2
    ),
    '',
    retrieved.profile ? `## Profile\n${JSON.stringify(retrieved.profile, null, 2)}` : '',
    '',
    `## Cards Enabled: ${plan.cardsEnabled}`,
    plan.cardsEnabled
      ? 'Include uiHints with relevant project/experience IDs.'
      : 'Do NOT include uiHints (no cards will be shown).',
  ]
    .filter(Boolean)
    .join('\n');
}
```

---

## Phase 4: Config & Types Cleanup

### 4.1 Update `chat.config.yml`

**Current:**

```yaml
models:
  plannerModel: gpt-5-mini-2025-08-07
  evidenceModel: gpt-5-mini-2025-08-07
  evidenceModelDeepDive: gpt-5-mini-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  reasoning:
    planner: minimal
    evidence: minimal
    answer: minimal
```

**New:**

```yaml
models:
  plannerModel: gpt-5-nano-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  embeddingModel: text-embedding-3-large
  reasoning:
    planner: low
    answer: low
```

---

### 4.2 Update `ModelConfig` Type

**File:** `packages/chat-contract/src/index.ts`

**Current:**

```ts
type ModelConfig = {
  plannerModel: string;
  evidenceModel: string;
  evidenceModelDeepDive?: string;
  answerModel: string;
  embeddingModel: string;
  answerTemperature?: number;
  stageReasoning?: StageReasoningConfig;
};
```

**New:**

```ts
type ModelConfig = {
  plannerModel: string;
  answerModel: string;
  embeddingModel: string;
  answerTemperature?: number;
  reasoning?: {
    planner?: ReasoningEffort;
    answer?: ReasoningEffort;
  };
};
```

---

### 4.3 Update `ReasoningTrace` (if keeping)

**Current:** Includes `plan`, `retrieval`, `evidence`, `answerMeta`

**New (simplified):**

```ts
type ReasoningTrace = {
  plan: PlannerLLMOutput;
  retrieval: RetrievalSummary[];
  answer: {
    model: string;
    uiHints: AnswerPayload['uiHints'];
  };
};
```

Or remove `ReasoningTrace` entirely if not using the dev panel.

---

## Phase 5: SSE Event Cleanup

### 5.1 Remove Evidence Stage Events

**File:** Next.js API route (wherever SSE is emitted)

**Remove events:**

- `stage: evidence_start`
- `stage: evidence_complete`
- `reasoning` updates for evidence

**Keep events:**

- `stage: planner_start/complete`
- `stage: retrieval_start/complete`
- `stage: answer_start/complete`
- `token`
- `ui`
- `done`
- `error`

---

### 5.2 Emit UI Earlier

Currently UI is emitted after Evidence completes. New flow:

```ts
// In answer streaming handler
onAnswerComplete: (answer) => {
  // Emit UI as soon as answer is complete (has uiHints)
  const ui = buildUi(answer.uiHints, retrieved, plan.cardsEnabled);
  emit('ui', ui);
};
```

Or parse uiHints from streaming JSON and emit before message completes.

---

## Phase 6: Test Updates

### 6.1 Nuke golden tests

want to start fresh

### 6.2 Nuke Eval Schema

want to start fresh

## Phase 7: Documentation Updates

### 7.1 Update Spec

**File:** `docs/features/chat/chat-spec.md`

Major rewrite needed:

- §2.3 Pipeline Overview — Remove Evidence stage
- §4.x Types — Remove `EvidenceSummary`, simplify others
- §5 LLM Pipeline — Remove §5.3 Evidence, merge into §5.4 Answer
- Appendix A — Remove evidence schemas

### 7.2 Update Findings Doc

**File:** `docs/tmp/spec-code-alignment-findings.md`

Mark Evidence-related items as N/A (stage removed).

---

## Implementation Order

### Week 1: Schema & Prompts

1. [ ] Add `PlannerLLMOutput` type to `chat-contract`
2. [ ] Update `AnswerPayload` type (add uiHints, remove thoughts)
3. [ ] Write new planner prompt
4. [ ] Write new answer prompt
5. [ ] Test prompts manually in playground

### Week 2: Pipeline Code

6. [ ] Remove Evidence functions from `pipeline.ts`
7. [ ] Update `planRetrieval()` for new schema
8. [ ] Update `generateAnswerPayload()` for combined role
9. [ ] Add live reasoning streaming for planner/retrieval (token/delta emit → `onReasoningUpdate`)
10. [ ] Pipe streaming reasoning through SSE + `useChatStream` into the reasoning panel
11. [ ] Simplify `buildUiArtifacts()` → `buildUi()`
12. [ ] Update `createChatRuntime.run()` flow

### Week 3: Reasoning Panel Animation

13. [ ] Create `ReasoningAnimations.tsx` with base primitives (StreamingText, ProgressArc)
14. [ ] Add stage-aware loading states (neurons, scanner, cursor)
15. [ ] Implement token stream reveal animation with fade-slide effect
16. [ ] Add progress arc to panel header with stage-based progress values
17. [ ] Add collapsed state activity pulse
18. [ ] Implement section expansion animations
19. [ ] Add completion flourish (icon morphing)
20. [ ] Add accessibility support (reduced motion, aria attributes)

### Week 4: Integration & Polish

21. [ ] Update `chat.config.yml`
22. [ ] Update SSE event emission
23. [ ] Update golden tests
24. [ ] Manual testing of all question types
25. [ ] Performance profiling of animations (target 60fps)
26. [ ] Test reduced motion behavior

### Week 5: Cleanup

27. [ ] Remove dead code (evidence types, functions)
28. [ ] Update spec documentation
29. [ ] Update reasoning trace (or remove)
30. [ ] Final review and cleanup

---

## Rollback Plan

If simplified pipeline has quality issues:

1. Keep old code on a `feature/evidence-stage` branch
2. Add feature flag: `ENABLE_EVIDENCE_STAGE=true`
3. Route to old pipeline when flag is set
4. Compare quality metrics between pipelines
5. Decide based on data

---

## Success Metrics

| Metric                      | Current  | Target         |
| --------------------------- | -------- | -------------- |
| TTFT (time to first token)  | ~1.6s    | ~1.1s          |
| Total response time         | ~2.5s    | ~2.0s          |
| Code lines in pipeline.ts   | ~3400    | ~2000          |
| Schema types                | 15+      | 5-6            |
| LLM calls per turn          | 3        | 2              |
| First reasoning delta       | ~1.0s    | <0.4s          |
| Answer quality (subjective) | Baseline | Same or better |
