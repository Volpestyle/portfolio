import type { ChatMessage, ChatMessagePart, ChatTextPart } from '@portfolio/chat-contract';
import type { ChatDebugLogEntry } from '@portfolio/chat-next-api';

function isTextPart(part: ChatMessagePart): part is ChatTextPart {
  return part.kind === 'text';
}

type TokenTotals = { prompt: number; completion: number; total: number };

function formatRole(role: ChatMessage['role']) {
  return role === 'assistant' ? 'Assistant' : 'User';
}

function safeTextBlock(text: string) {
  if (!text) {
    return '_(empty text)_';
  }
  return ['```', text, '```'].join('\n');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractUsageFromPayload(payload: unknown): (TokenTotals & { stage: string }) | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const payloadObj = payload as Record<string, unknown>;
  const usageSource = (payloadObj.usage ?? payloadObj) as Record<string, unknown>;
  if (!usageSource || typeof usageSource !== 'object') {
    return null;
  }

  const prompt = toNumber((usageSource as Record<string, unknown>).prompt_tokens ?? (usageSource as Record<string, unknown>).promptTokens);
  const completion = toNumber(
    (usageSource as Record<string, unknown>).completion_tokens ?? (usageSource as Record<string, unknown>).completionTokens
  );
  const total =
    toNumber((usageSource as Record<string, unknown>).total_tokens ?? (usageSource as Record<string, unknown>).totalTokens) ??
    (prompt ?? 0) + (completion ?? 0);

  if (prompt === null && completion === null && total === 0) {
    return null;
  }

  const stage = typeof payloadObj.stage === 'string' && payloadObj.stage.trim() ? payloadObj.stage : 'unknown';

  return {
    prompt: prompt ?? 0,
    completion: completion ?? 0,
    total: total ?? 0,
    stage,
  };
}

export function summarizeTokenUsage(logs?: ChatDebugLogEntry[]) {
  if (!logs?.length) return null;

  const totals: TokenTotals = { prompt: 0, completion: 0, total: 0 };
  const byStage: Record<string, TokenTotals> = {};
  let count = 0;

  logs.forEach((entry) => {
    const usage = extractUsageFromPayload(entry.payload);
    if (!usage) {
      return;
    }
    count += 1;
    totals.prompt += usage.prompt;
    totals.completion += usage.completion;
    totals.total += usage.total;

    const bucket = byStage[usage.stage] ?? { prompt: 0, completion: 0, total: 0 };
    bucket.prompt += usage.prompt;
    bucket.completion += usage.completion;
    bucket.total += usage.total;
    byStage[usage.stage] = bucket;
  });

  if (!count) return null;
  return { totals, byStage };
}

export function formatChatMessagesAsMarkdown(messages: ChatMessage[], debugLogs?: ChatDebugLogEntry[]): string {
  const lines: string[] = [
    '# Chat Debug Export',
    '',
    `Exported: ${new Date().toISOString()}`,
    `Total messages: ${messages.length}`,
    '',
  ];

  messages.forEach((message, index) => {
    lines.push('---', '');
    lines.push(`## ${index + 1}. ${formatRole(message.role)} message`);
    lines.push(`- id: ${message.id}`);
    lines.push(`- created: ${message.createdAt ?? 'unknown'}`);
    lines.push(`- parts: ${message.parts.length}`);
    lines.push('');

    const textParts = message.parts.filter(isTextPart);
    if (textParts.length) {
      lines.push('### Text');
      textParts.forEach((part, partIndex) => {
        const partLabel = part.itemId ? `Text ${partIndex + 1} (${part.itemId})` : `Text ${partIndex + 1}`;
        lines.push(`**${partLabel}**`);
        lines.push('');
        lines.push(safeTextBlock(part.text));
        lines.push('');
      });
    } else {
      lines.push('_No text content_');
      lines.push('');
    }

  });

  if (messages.length === 0) {
    lines.push('_(no messages to export)_');
  }

  if (debugLogs && debugLogs.length) {
    lines.push('', '---', '', '## Debug Logs', '');
    debugLogs.forEach((entry, index) => {
      lines.push(`### ${index + 1}. ${entry.event} (${entry.timestamp})`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(entry.payload ?? {}, null, 2));
      lines.push('```');
      lines.push('');
    });
  }

  const usageSummary = summarizeTokenUsage(debugLogs);
  if (usageSummary) {
    lines.push('', '---', '', '## Token Usage Summary', '');
    lines.push(`- Prompt tokens: ${usageSummary.totals.prompt}`);
    lines.push(`- Completion tokens: ${usageSummary.totals.completion}`);
    lines.push(`- Total tokens: ${usageSummary.totals.total}`);
    const stageEntries = Object.entries(usageSummary.byStage);
    if (stageEntries.length) {
      lines.push('- By stage:');
      stageEntries.forEach(([stage, totals]) => {
        lines.push(
          `  - ${stage}: prompt=${totals.prompt}, completion=${totals.completion}, total=${totals.total}`
        );
      });
    }
  } else if (debugLogs && debugLogs.length) {
    lines.push('', '---', '', '## Token Usage Summary', '', '- No token usage logs found.');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
