import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

type ChatDebugLogEntry = {
  timestamp: string;
  event: string;
  payload?: unknown;
  correlationId?: string;
  conversationId?: string;
};

declare global {
  var __chatDebugLogBuffer__: ChatDebugLogEntry[] | undefined;
}

const DEBUG_FLAG = process.env.CHAT_DEBUG_LOG ?? process.env.NEXT_PUBLIC_CHAT_DEBUG_LOG;
const parsedLevel = Number.parseInt(DEBUG_FLAG ?? '', 10);
const DEBUG_LEVEL = Number.isFinite(parsedLevel) ? parsedLevel : process.env.NODE_ENV === 'production' ? 0 : 1;
const ENABLED = DEBUG_LEVEL >= 1;
const REDACT_SENSITIVE = DEBUG_LEVEL === 3;
const MAX_LOGS = Math.max(50, Number(process.env.CHAT_DEBUG_LOG_LIMIT ?? 500) || 500);
const BUFFER_ENABLED = process.env.NODE_ENV !== 'production';

if (!globalThis.__chatDebugLogBuffer__) {
  globalThis.__chatDebugLogBuffer__ = [];
}
const buffer = globalThis.__chatDebugLogBuffer__;

type ChatLogContext = {
  correlationId?: string;
  conversationId?: string;
};

const chatLogContext = new AsyncLocalStorage<ChatLogContext>();

function pruneBuffer() {
  if (buffer.length <= MAX_LOGS) {
    return;
  }
  buffer.splice(0, buffer.length - MAX_LOGS);
}

function isRawEvent(event: string): boolean {
  return event.includes('.raw');
}

const RAW_PREFERRED_BASE_EVENTS = new Set([
  'query.rewrite.project',
  'query.rewrite.experience',
  'selection.project',
  'selection.experience',
]);

function splitEvent(event: string): { namespace: string; action: string } {
  if (event.includes(':')) {
    const [namespace, ...rest] = event.split(':');
    const action = rest.length > 0 ? rest.join(':') : namespace || 'chat';
    return { namespace: namespace || 'chat', action };
  }
  const [namespace, ...rest] = event.split('.');
  const action = rest.length > 0 ? rest.join('.') : namespace || 'chat';
  return { namespace: namespace || 'chat', action };
}

function safeClonePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return String(payload);
  }
}

function shouldLogEvent(event: string): boolean {
  if (!ENABLED) return false;
  if (DEBUG_LEVEL === 1 && isRawEvent(event)) return false;
  if (DEBUG_LEVEL === 2 && RAW_PREFERRED_BASE_EVENTS.has(event)) return false;
  return true;
}

function isErrorEvent(event: string): boolean {
  return /(?:^|[._:])(?:error|failure)(?:$|[._:])/i.test(event);
}

function logToConsole(event: string, payload: unknown, level: 'info' | 'error' = 'info') {
  const { namespace, action } = splitEvent(event);
  const tags = ['chat-debug', `level-${DEBUG_LEVEL}`];
  const context = chatLogContext.getStore();
  if (context?.correlationId) {
    tags.push(`cid:${context.correlationId}`);
  }
  if (isRawEvent(event)) {
    tags.push('raw');
  }
  const prefix = `[${tags.join('|')}] [${namespace}] ${action}`;
  const log = level === 'error' ? console.error : console.info;
  if (payload === undefined) {
    log(prefix);
    return;
  }
  log(prefix, payload);
}

const SECRET_KEY_HINTS = [
  'api',
  'key',
  'token',
  'secret',
  'auth',
  'authorization',
  'cookie',
  'session',
  'credential',
  'password',
  'signature',
  'header',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_HINTS.some((hint) => lower.includes(hint));
}

function redactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (isSensitiveKey(key)) return '[redacted]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }
  if (typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      redacted[childKey] = redactValue(childKey, childValue);
    }
    return redacted;
  }
  return value;
}

export function logChatDebug(event: string, payload?: unknown) {
  const forceEmit = isErrorEvent(event);
  const loggable = forceEmit || shouldLogEvent(event);
  if (!loggable) {
    return;
  }
  const context = chatLogContext.getStore();
  const safePayload = safeClonePayload(payload);
  const storedPayload = REDACT_SENSITIVE ? redactValue('', safePayload) : safePayload;
  const level = forceEmit ? 'error' : 'info';
  if (BUFFER_ENABLED && shouldLogEvent(event)) {
    buffer.push({
      timestamp: new Date().toISOString(),
      event,
      payload: storedPayload,
      correlationId: context?.correlationId,
      conversationId: context?.conversationId,
    });
    pruneBuffer();
  }
  logToConsole(event, storedPayload, level);
}

export function getChatDebugLogs(): ChatDebugLogEntry[] {
  if (DEBUG_LEVEL === 0 || !BUFFER_ENABLED) return [];
  const logs = buffer.slice();
  if (DEBUG_LEVEL === 1) {
    return logs.filter((entry) => !isRawEvent(entry.event));
  }
  return logs;
}

export function resetChatDebugLogs() {
  buffer.length = 0;
}

export const CHAT_DEBUG_LEVEL = DEBUG_LEVEL;

export type { ChatDebugLogEntry };

export function runWithChatLogContext<T>(context: ChatLogContext, callback: () => Promise<T> | T): Promise<T> {
  return chatLogContext.run(context, () => Promise.resolve(callback()));
}
