'use client';

let lastLogTime: number | null = null;
let sequence = 0;

const envDebug =
  typeof process !== 'undefined' && process.env && typeof process.env.NEXT_PUBLIC_DEBUG_TYPEWRITER === 'string'
    ? process.env.NEXT_PUBLIC_DEBUG_TYPEWRITER
    : undefined;

const parseFlag = (value?: string | null) => value === '1' || value === 'true';

export function isTypewriterDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return parseFlag(envDebug);
  }

  const queryFlag = (() => {
    try {
      return new URLSearchParams(window.location?.search ?? '').get('debugTypewriter');
    } catch {
      return null;
    }
  })();
  const storedFlag = (() => {
    try {
      return window.localStorage?.getItem('debug:typewriter');
    } catch {
      return null;
    }
  })();

  return parseFlag(queryFlag) || parseFlag(storedFlag) || parseFlag(envDebug);
}

export function typewriterDebug(event: string, payload: Record<string, unknown> = {}) {
  if (!isTypewriterDebugEnabled()) {
    return;
  }
  const now = Date.now();
  const deltaMs = lastLogTime === null ? undefined : now - lastLogTime;
  lastLogTime = now;
  sequence += 1;
  const base = {
    seq: sequence,
    ts: new Date(now).toISOString(),
  };
  console.log(`[TypewriterDebug] ${event}`, {
    ...base,
    ...(deltaMs !== undefined ? { deltaMs } : null),
    ...payload,
  });
}

export function typewriterPreview(value: string, max = 160) {
  if (!value) return '';
  const snippet = value.slice(0, max);
  return value.length > max ? `${snippet}...` : snippet;
}
