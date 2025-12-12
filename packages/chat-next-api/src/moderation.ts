import type { ChatRequestMessage } from '@portfolio/chat-contract';
import type OpenAI from 'openai';
import type { JsonSchema, LlmClient } from '@portfolio/chat-llm';

const DEFAULT_MODERATION_MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
const DEFAULT_ANTHROPIC_MODERATION_MODEL = 'claude-3-5-haiku-latest';

export type ModerationResult = {
  flagged: boolean;
  categories?: string[];
};

const MODERATION_SCHEMA: JsonSchema = {
  type: 'json_schema',
  name: 'moderation_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['flagged'],
    properties: {
      flagged: { type: 'boolean', description: 'True if content should be blocked for safety reasons.' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional category labels for why content was flagged.',
      },
    },
  },
};

function findLatestUserMessage(messages: ChatRequestMessage[]): string | null {
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const entry = messages[idx];
    if (entry?.role === 'user' && typeof entry.content === 'string') {
      const normalized = entry.content.trim();
      if (normalized.length) {
        return normalized;
      }
    }
  }
  return null;
}

function normalizeModerationCandidate(candidate: unknown): ModerationResult {
  if (!candidate || typeof candidate !== 'object') {
    return { flagged: false };
  }
  const record = candidate as { flagged?: unknown; categories?: unknown };
  const flagged = typeof record.flagged === 'boolean' ? record.flagged : false;
  const categories = Array.isArray(record.categories)
    ? record.categories.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    : undefined;
  return categories?.length ? { flagged, categories } : { flagged };
}

export async function moderateChatMessages(
  client: OpenAI,
  messages: ChatRequestMessage[],
  options?: { model?: string }
): Promise<ModerationResult> {
  const latestUserMessage = findLatestUserMessage(messages);
  if (!latestUserMessage) {
    return { flagged: false };
  }

  const response = await client.moderations.create({
    model: options?.model ?? DEFAULT_MODERATION_MODEL,
    input: latestUserMessage,
  });

  const flagged = response.results?.some((result) => result.flagged) ?? false;
  if (!flagged) {
    return { flagged: false };
  }

  const categories = new Set<string>();
  for (const result of response.results ?? []) {
    const record = result.categories ?? {};
    for (const [category, value] of Object.entries(record)) {
      if (value) {
        categories.add(category);
      }
    }
  }

  return { flagged: true, categories: Array.from(categories) };
}

export async function moderateTextForProvider(
  client: LlmClient,
  input: string,
  options?: { model?: string }
): Promise<ModerationResult> {
  const text = (input ?? '').trim();
  if (!text) {
    return { flagged: false };
  }

  if (client.provider === 'openai') {
    const response = await client.openai.moderations.create({
      model: options?.model ?? DEFAULT_MODERATION_MODEL,
      input: text,
    });
    const flagged = response.results?.some((result) => result.flagged) ?? false;
    if (!flagged) {
      return { flagged: false };
    }
    const categories = new Set<string>();
    for (const result of response.results ?? []) {
      const record = result.categories ?? {};
      for (const [category, value] of Object.entries(record)) {
        if (value) {
          categories.add(category);
        }
      }
    }
    return { flagged: true, categories: Array.from(categories) };
  }

  // Anthropic-native “safety classifier” using Claude itself.
  const result = await client.createStructuredJson({
    model: options?.model ?? DEFAULT_ANTHROPIC_MODERATION_MODEL,
    systemPrompt:
      'You are a safety classifier for a portfolio chatbot. Decide whether the content should be blocked. ' +
      'Flag content that requests or contains disallowed/harmful material (e.g. explicit sexual content, hate, violence, self-harm encouragement, illegal wrongdoing, instructions for harm). ' +
      'If the content is about a developer portfolio/career/tech, it is typically allowed.',
    userContent: `Content to evaluate:\n${text}`,
    jsonSchema: MODERATION_SCHEMA,
    stage: 'moderation',
  });

  const parsed = result.structured ?? (() => {
    try {
      return JSON.parse(result.rawText ?? '{}') as unknown;
    } catch {
      return undefined;
    }
  })();

  return normalizeModerationCandidate(parsed);
}

export async function moderateChatMessagesForProvider(
  client: LlmClient,
  messages: ChatRequestMessage[],
  options?: { model?: string }
): Promise<ModerationResult> {
  const latestUserMessage = findLatestUserMessage(messages);
  if (!latestUserMessage) {
    return { flagged: false };
  }
  return moderateTextForProvider(client, latestUserMessage, options);
}
