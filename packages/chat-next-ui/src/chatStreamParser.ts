import {
  createParser,
  type EventSourceParser,
  type EventSourceParseCallback,
  type ParseEvent,
} from 'eventsource-parser';

export type ChatStreamEvent =
  | { type: 'item'; itemId?: string }
  | { type: 'token'; token: string; itemId?: string }
  | { type: 'ui'; ui?: unknown; itemId?: string }
  | { type: 'reasoning'; stage?: string; trace?: unknown; delta?: string; notes?: string; progress?: number; itemId?: string }
  | { type: 'attachment'; attachment?: unknown; itemId?: string }
  | { type: 'ui_actions'; actions?: unknown; itemId?: string }
  | {
      type: 'error';
      error?: unknown;
      code?: string;
      message?: string;
      retryable?: boolean;
      retryAfterMs?: number;
      itemId?: string;
      anchorId?: string;
    }
  | { type: 'done'; truncationApplied?: boolean; itemId?: string; anchorId?: string; totalDurationMs?: number }
  | { type: string; [key: string]: unknown };

type ParseStreamOptions = {
  onParseError?: (error: unknown) => void;
};

export async function* parseChatStream(
  stream: ReadableStream<Uint8Array>,
  options?: ParseStreamOptions
): AsyncGenerator<ChatStreamEvent> {
  const decoder = new TextDecoder();
  const pending: ChatStreamEvent[] = [];
  const parser: EventSourceParser = createParser(((event: ParseEvent) => {
    if (event.type !== 'event') {
      return;
    }
    const payload = (event.data || '').trim();
    if (!payload) {
      return;
    }
    try {
      const parsed = JSON.parse(payload) as ChatStreamEvent;
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        pending.push(parsed);
      }
    } catch (error) {
      options?.onParseError?.(error);
    }
  }) as EventSourceParseCallback);

  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    parser.feed(decoder.decode(value, { stream: true }));
    while (pending.length) {
      yield pending.shift() as ChatStreamEvent;
    }
  }

  // flush any remaining buffered text
  parser.feed(decoder.decode());
  while (pending.length) {
    yield pending.shift() as ChatStreamEvent;
  }
}
