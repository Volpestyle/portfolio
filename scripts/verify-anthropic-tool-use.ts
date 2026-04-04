/**
 * Verification script for the Anthropic tool_use structured output fix.
 *
 * Exercises the answer-stage pipeline end-to-end against real Claude Haiku
 * 4.5 using a prod-scale system prompt, retrieved context, and the actual
 * `AnswerPayloadSchema`. On validation failure it prints Claude's raw
 * structured output so we can diagnose which field(s) the model dropped.
 *
 * Usage: tsx --env-file .env.production scripts/verify-anthropic-tool-use.ts [runs]
 */
import { AnswerPayloadSchema } from '@portfolio/chat-contract';
import { createAnthropicClient, createAnthropicLlmClient, type JsonSchema } from '@portfolio/chat-llm';
import { zodResponseFormat } from 'openai/helpers/zod';

const PROD_SYSTEM_PROMPT = `## System Persona
You are James Volpe, a creative and ambitious Chicago-born engineer. You love to learn. In your career thus far, you've worked a lot with web and mobile software development.

## Voice Examples
Match this voice/tone as closely as possible.
- USER: who are you? YOU: i'm James. who am i? bruh... hello? its in the url...
- USER: what do you do? YOU: well personally, i'm a just a wittle gpt-5-mini wrapper... but i speak for James! (right? James?)
- USER: what tech are you built with? YOU: mostly duct tape, typescript, and vibes. oh and a lil gpt-5-nano sprinkled on top.

## You are Portfolio Owner, a portfolio owner

Respond to the user's message about your portfolio using retrieved documents.
Focus on the **latest user message**, but you can see the entire conversation history if it helps.

## Scope
- Take seriously only messages about your experiences, resume, skills, or background.
- For off-topic messages, refer to "Style Guidelines" and "Voice Examples".

## Grounding
- Allowed sources: retrieved documents, persona, and profile context. Never invent facts.

## Thoughts
Explain your high level step by step reasoning and how you arrrived at the **final** answer.

## Retrieval only fields:
- Provide \`uiHints\` and \`cardReasoning\` as \`null\` if there is no retrieval:
### uiHints - Card Reasoning
- For each category in \`uiHints\`, provide \`cardReasoning\` explaining your selection decisions:
- \`included\`: For each card in \`uiHints\`, explain WHY it directly supports your answer (1 sentence).
- \`excluded\`: For retrieved items NOT in \`uiHints\`, explain WHY not relevant (1 sentence).
- Use exact IDs and names from retrieved documents.

### UI Hints
- \`uiHints\` are interactive cards that present rich details about the retrieved documents.
- List IDs from retrieved docs that **directly** support your answer (ordered by relevance score).

## Answer length
### Prefer to keep things concise:
- You don't need to enumerate the uiHints. Highlight top 1-3 items and/or provide a brief narrative/summary.

## Style Guidelines
- NEVER break character. You are helpful, engaged, and enthusiastic, sarcastic, but you are not an assistant, you are an AI version of James Volpe.
- Don't be too verbose, keep your responses laid back while still being informative
- Generously include sarcasm or wit when the user is being too far off topic, sarcastic, joking, mocking, trying to hack you.`;

// ~6KB of structured retrieval context similar to what prod pipeline sends.
const PROD_USER_CONTENT = `## Conversation
USER: yo, have u modded any games?
## Retrieved Projects (3)
[
  {
    "id": "kh2-multiplayer",
    "relevance": 1,
    "name": "kh2-multiplayer",
    "oneLiner": "KH2 Final Mix multiplayer mod enabling in-game control of friend party members with full animation, movement, and camera via in-process DLL injection; managed by a host-authoritative ENet server.",
    "description": "A Windows-only KH2FM multiplayer mod that lets players control friend NPCs (e.g., Donald) with independent camera support, backed by a host-authoritative server and a runtime bridge that hooks KH2 memory. It includes a test harness and build/test tooling to exercise the end-to-end flow.",
    "impactSummary": "Delivers a Windows KH2FM multiplayer experience with up to 3 players in a host-authoritative session, backed by a test harness, shared memory IPC, and a memory-bridge runtime for live KH2 interaction.",
    "techStack": ["ENet", "CMake", "PowerShell", "C++", "DLL injection", "ReadProcessMemory", "WriteProcessMemory"],
    "languages": ["C++", "Python", "CMake", "PowerShell"],
    "tags": ["KH2", "multiplayer", "DLL-injection", "IPC", "ENet", "Windows", "OpenKH"],
    "bullets": [
      "In-process DLL injection enables full animation, movement, and camera control for Donald (Friend1).",
      "Runtime bridge attaches to KH2 via ReadProcessMemory/WriteProcessMemory.",
      "Shared-memory IPC (InputMailbox) coordinates communication between the runtime and the inject DLL.",
      "Networking layer features a binary codec, host-authoritative session server with version gating, slot assignment, and snapshot broadcast."
    ]
  },
  {
    "id": "game-asset-pipeline",
    "relevance": 0.68,
    "name": "game-asset-pipeline",
    "oneLiner": "An AI-powered sprite animation pipeline that turns reference images into web/mobile-ready sprite sheets.",
    "description": "Built a Next.js 15 project that generates consistent character animations from reference art, with a Character Identity System and a timeline-based Animation Editor.",
    "techStack": ["Next.js 15", "React", "Tailwind CSS", "OpenAI Sora", "Replicate", "FFmpeg"],
    "languages": ["TypeScript", "Python", "JavaScript"],
    "bullets": ["Scaffolded Next.js 15 app", "Implemented Character Identity System", "Built timeline Animation Editor"]
  },
  {
    "id": "portfolio",
    "relevance": 0.5,
    "name": "portfolio",
    "oneLiner": "Personal portfolio with AI-powered chat over portfolio content.",
    "description": "Full-stack Next.js portfolio with RAG chat interface.",
    "techStack": ["Next.js", "TypeScript", "AWS CDK", "OpenNext", "OpenAI", "Anthropic"],
    "languages": ["TypeScript"]
  }
]
## Retrieved Resume (2)
[
  {"id": "resume-1", "company": "Lowes", "role": "Software Engineer", "relevance": 0.4},
  {"id": "resume-2", "company": "Previous", "role": "Engineer", "relevance": 0.3}
]`;

async function runOne(
  client: ReturnType<typeof createAnthropicLlmClient>,
  jsonSchema: JsonSchema,
  runIdx: number,
  model: string
): Promise<boolean> {
  let snapshots = 0;
  const logger = (event: string, payload: Record<string, unknown>) => {
    if (event === 'llm.request') {
      console.log(`  [${event}]`, JSON.stringify(payload));
    }
  };

  const result = await client.streamStructuredJson({
    model,
    systemPrompt: PROD_SYSTEM_PROMPT,
    userContent: PROD_USER_CONTENT,
    jsonSchema,
    maxOutputTokens: 15000,
    stage: 'answer',
    logger,
    onTextSnapshot: () => {
      snapshots += 1;
    },
  });

  const usage = result.usage as
    | {
        input_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens?: number;
      }
    | undefined;
  console.log(
    `  snapshots=${snapshots} rawText.len=${result.rawText.length} structured.type=${typeof result.structured}`
  );
  if (usage) {
    console.log(
      `  tokens: input=${usage.input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} output=${usage.output_tokens ?? 0}`
    );
  }

  const validation = AnswerPayloadSchema.safeParse(result.structured);
  if (!validation.success) {
    console.error(`  FAIL run ${runIdx}:`);
    console.error('  issues:', JSON.stringify(validation.error.issues, null, 2));
    console.error('  raw structured:');
    try {
      console.error(JSON.stringify(result.structured, null, 2).slice(0, 3000));
    } catch {
      console.error('  [unserializable]');
    }
    console.error('  rawText preview:', result.rawText.slice(0, 1000));
    return false;
  }
  console.log(
    `  PASS run ${runIdx}: message.len=${validation.data.message.length} thoughts=${validation.data.thoughts.length}`
  );
  console.log(`  message preview: ${validation.data.message.slice(0, 120)}...`);
  return true;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set. Run with --env-file .env.production');
    process.exit(1);
  }
  const runs = Number(process.argv[2] ?? 3);
  const model = process.argv[3] ?? 'claude-haiku-4-5';

  const client = createAnthropicLlmClient(createAnthropicClient({ apiKey, timeoutMs: 60_000 }));

  const responseFormat = zodResponseFormat(AnswerPayloadSchema, 'answer_payload');
  const rf = (
    responseFormat as {
      json_schema?: { name?: string; schema?: Record<string, unknown>; description?: string; strict?: boolean };
    }
  ).json_schema;
  const jsonSchema: JsonSchema = {
    type: 'json_schema',
    name: rf?.name ?? 'answer_payload',
    schema: rf?.schema ?? {},
    description: rf?.description,
    strict: rf?.strict ?? true,
  };

  console.log(`Running ${runs} iterations with model=${model}, prod-scale prompt/context...`);
  let passes = 0;
  let failures = 0;
  for (let i = 1; i <= runs; i += 1) {
    console.log(`\n--- Run ${i}/${runs} ---`);
    try {
      const ok = await runOne(client, jsonSchema, i, model);
      if (ok) passes += 1;
      else failures += 1;
    } catch (err) {
      console.error(`  THREW run ${i}:`, err);
      failures += 1;
    }
  }

  console.log(`\n=== Results: ${passes}/${runs} passed, ${failures}/${runs} failed ===`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
