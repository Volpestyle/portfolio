import type { ChatRequestMessage } from '@portfolio/chat-contract';
import type OpenAI from 'openai';

const DEFAULT_MODERATION_MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';

export type ModerationResult = {
  flagged: boolean;
  categories?: string[];
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
