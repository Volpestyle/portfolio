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
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  onIdleTimeout?: () => void;
};

export async function* parseChatStream(
  stream: ReadableStream<Uint8Array>,
  options?: ParseStreamOptions
): AsyncGenerator<ChatStreamEvent> {
  const decoder = new TextDecoder();
  const pending: ChatStreamEvent[] = [];
  const idleTimeoutMs = options?.idleTimeoutMs ?? 0;
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
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTriggered = false;
  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const resetIdleTimer = () => {
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
      return;
    }
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTriggered = true;
      options?.onIdleTimeout?.();
      reader.cancel(new Error('chat_stream_idle')).catch(() => {});
    }, idleTimeoutMs);
  };

  const abortSignal = options?.signal;
  const abortHandler = () => {
    clearIdleTimer();
    reader.cancel(abortSignal?.reason).catch(() => {});
  };
  if (abortSignal) {
    abortSignal.addEventListener('abort', abortHandler, { once: true });
  }

  resetIdleTimer();
  while (true) {
    let value: Uint8Array | undefined;
    let done = false;
    try {
      const readResult = await reader.read();
      value = readResult.value;
      done = readResult.done;
    } catch (error) {
      // If we intentionally cancelled the reader due to idle timeout, just exit.
      if (idleTriggered) {
        break;
      }
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? error;
      }
      throw error;
    }
    if (done) {
      break;
    }
    resetIdleTimer();
    parser.feed(decoder.decode(value, { stream: true }));
    while (pending.length) {
      resetIdleTimer();
      yield pending.shift() as ChatStreamEvent;
    }
  }

  // flush any remaining buffered text
  parser.feed(decoder.decode());
  while (pending.length) {
    yield pending.shift() as ChatStreamEvent;
  }

  clearIdleTimer();
  if (abortSignal) {
    abortSignal.removeEventListener('abort', abortHandler);
  }
}
