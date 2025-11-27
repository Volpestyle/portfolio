# Chat latency mitigation plan (reasoning bloat)

## Background
- Recent turn (“show me some react projects”) took ~93s: evidence ~55s, answer ~28s.
- Both stages emitted large reasoning traces (5.9k and 2.8k tokens), despite using the nano model.
- Reasoning is auto-enabled by default in the UI, so every turn requests traces even for simple enumerations.

## Goals
- P95 end-to-end latency under 10s for simple enumerate turns.
- Keep reasoning disabled by default; allow opt-in for debugging only.
- Reduce reasoning-token volume by 80%+ on non-debug runs.

## Workstreams
1) **UI defaults & controls**
   - Flip `ChatProvider` default: `reasoningOptIn` → `false`.
   - Add an explicit “Show reasoning (debug)” toggle in the chat UI; persist per session.
   - When the toggle is off, do not request reasoning in the request payload.

2) **Server-side guardrails**
   - Auto-disable reasoning when `intent = enumerate` and `uiTarget` is cards-only (projects/experiences) unless explicitly requested.
   - Add a maximum reasoning length hint in prompts (planner/evidence/answer) to keep traces concise when enabled.
   - Consider fast-path: if retrieval < N docs and no reasoning requested, skip evidence model and synthesize answer from retrieval directly (existing `fastPath` hook? verify and tune).

3) **Token/latency caps**
   - Introduce stage-level timeouts (evidence/answer) with fallback to shorter answers when exceeded.
   - Request smaller `topK` for simple enumerate prompts to reduce evidence input size; keep `enumerateAllRelevant` only when asked.

4) **Observability**
   - Log reasoning token counts per stage and include in stage timing metrics.
   - Add a flag in the debug export showing whether reasoning was requested/forced.
   - Track P50/P95 latency by intent and reasoning flag; alert when P95 enumerate-without-reasoning > 10s.

5) **QA checklist**
   - Verify default chat load: reasoning off, fast response for “show me some react projects.”
   - Toggle on reasoning: traces stream, but total latency stays < 20s with capped reasoning tokens.
   - Regression pass on other intents (describe/fact_check) to ensure answers still render when reasoning is off.

## Owners / timeline
- UI defaults + toggle: 1 day.
- Server guardrails + caps: 1–2 days.
- Observability + QA: 1 day.
