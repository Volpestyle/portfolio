'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@/hooks/useChat';
import { formatChatMessagesAsMarkdown } from '@/lib/chat-debug';
import type { ChatDebugLogEntry } from '@portfolio/chat-next-api';

const isDevEnvironment = process.env.NODE_ENV !== 'production';
const DEV_MODE_STORAGE_KEY = 'chat:reasoningDevMode';
const DEV_MODE_EVENT = 'chat:reasoningDevModeChanged';

export function ChatDevTools() {
  const { messages } = useChat();
  const [isSaving, setSaving] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [devReasoningView, setDevReasoningView] = useState(false);
  const [devReasoningInitialized, setDevReasoningInitialized] = useState(false);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalTarget(document.body);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!hasMessages || isSaving) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      let debugLogs: ChatDebugLogEntry[] = [];
      try {
        const logsResponse = await fetch('/api/debug/chat-logs');
        if (logsResponse.ok) {
          const data = (await logsResponse.json()) as { logs?: ChatDebugLogEntry[] };
          debugLogs = Array.isArray(data.logs) ? data.logs : [];
        }
      } catch {
        // Ignore log fetch failures; still export the chat transcript.
      }

      const markdown = formatChatMessagesAsMarkdown(messages, debugLogs);
      const timestamp = new Date().toISOString().replace(/[:]/g, '-');
      const filename = `chat-debug-${timestamp}.md`;
      const response = await fetch('/api/debug/chat-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markdown, filename }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || 'Failed to write export.');
      }

      const data = (await response.json()) as { relativePath?: string };
      setLastExportPath(typeof data.relativePath === 'string' ? data.relativePath : null);
    } catch (err) {
      console.error('Chat export failed', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to export chat.');
      setLastExportPath(null);
    } finally {
      setSaving(false);
    }
  }, [hasMessages, isSaving, messages]);

  // Hydrate dev/user reasoning view toggle from localStorage in dev
  useEffect(() => {
    if (!isDevEnvironment || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(DEV_MODE_STORAGE_KEY);
    setDevReasoningView(stored === '1');
    setDevReasoningInitialized(true);
  }, []);

  // Persist and broadcast toggle changes after render (avoids cross-component setState during render)
  useEffect(() => {
    if (!isDevEnvironment || typeof window === 'undefined' || !devReasoningInitialized) return;
    try {
      if (devReasoningView) {
        window.localStorage.setItem(DEV_MODE_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(DEV_MODE_STORAGE_KEY);
      }
      window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { enabled: devReasoningView } }));
    } catch {
      // ignore storage errors
    }
  }, [devReasoningView, devReasoningInitialized]);

  const toggleDevReasoningView = useCallback(() => {
    if (!isDevEnvironment || typeof window === 'undefined') return;
    setDevReasoningView((prev) => !prev);
  }, []);

  if (!isDevEnvironment || !portalTarget) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex max-w-sm flex-col gap-2 text-[11px]">
      <button
        type="button"
        onClick={handleExport}
        disabled={!hasMessages || isSaving}
        className="pointer-events-auto rounded-full border border-white/30 bg-black/70 px-4 py-2 font-semibold uppercase tracking-wide text-white/70 shadow-lg transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        title={
          hasMessages ? 'Write the current chat transcript into debug/chat-exports' : 'Start chatting to enable exports'
        }
      >
        {isSaving ? 'Saving…' : 'Export Chat to Repo'}
      </button>
      <button
        type="button"
        onClick={toggleDevReasoningView}
        className="pointer-events-auto rounded-full border border-white/20 bg-black/60 px-4 py-2 font-semibold uppercase tracking-wide text-white/60 shadow-lg transition hover:text-white"
        title="Toggle between user-facing and developer reasoning panels"
      >
        {devReasoningView ? '← User Reasoning View' : '→ Dev Reasoning View'}
      </button>
      {lastExportPath ? (
        <div className="pointer-events-auto rounded bg-emerald-500/20 px-3 py-2 font-mono text-[10px] text-emerald-100">
          Saved to {lastExportPath}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="pointer-events-auto rounded bg-red-500/20 px-3 py-2 font-mono text-[10px] text-red-100">
          {errorMessage}
        </div>
      ) : null}
    </div>,
    portalTarget
  );
}
