'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Code, User, Settings } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatChatMessagesAsMarkdown } from '@/lib/chat-debug';
import { AnimatedExpandButton } from '@/components/ui/AnimatedExpandButton';
import type { ChatDebugLogEntry } from '@portfolio/chat-next-api';

const isDevEnvironment = process.env.NODE_ENV === 'development';
const DEV_MODE_STORAGE_KEY = 'chat:reasoningDevMode';
const DEV_MODE_EVENT = 'chat:reasoningDevModeChanged';

export function ChatDevTools() {
  const { messages } = useChat();
  const isAdmin = useIsAdmin();
  const showDevTools = isDevEnvironment || isAdmin;
  const [isSaving, setSaving] = useState(false);
  const [lastExportInfo, setLastExportInfo] = useState<{ label: string; url?: string } | null>(null);
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
    setLastExportInfo(null);

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
        let details = '';
        try {
          const errorBody = (await response.json()) as { error?: string };
          details = typeof errorBody.error === 'string' ? errorBody.error : '';
        } catch {
          details = await response.text();
        }
        throw new Error(details || 'Failed to write export.');
      }

      const data = (await response.json()) as {
        storage?: string;
        relativePath?: string;
        bucket?: string;
        key?: string;
        downloadUrl?: string;
      };

      if (data.storage === 's3' && data.key) {
        const label = data.bucket ? `${data.bucket}/${data.key}` : data.key;
        setLastExportInfo({ label, url: data.downloadUrl });
      } else if (data.relativePath) {
        setLastExportInfo({ label: data.relativePath });
      } else {
        setLastExportInfo(null);
      }
    } catch (err) {
      console.error('Chat export failed', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to export chat.');
      setLastExportInfo(null);
    } finally {
      setSaving(false);
    }
  }, [hasMessages, isSaving, messages]);

  // Hydrate dev/user reasoning view toggle from localStorage
  useEffect(() => {
    if (!showDevTools || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(DEV_MODE_STORAGE_KEY);
    setDevReasoningView(stored === '1');
    setDevReasoningInitialized(true);
  }, [showDevTools]);

  // Persist and broadcast toggle changes after render (avoids cross-component setState during render)
  useEffect(() => {
    if (!showDevTools || typeof window === 'undefined' || !devReasoningInitialized) return;
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
  }, [showDevTools, devReasoningView, devReasoningInitialized]);

  const toggleDevReasoningView = useCallback(() => {
    if (!showDevTools || typeof window === 'undefined') return;
    setDevReasoningView((prev) => !prev);
  }, [showDevTools]);

  if (!showDevTools || !portalTarget) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* Toolbar */}
      <div className="pointer-events-auto hidden h-10 items-center gap-1 rounded-full border border-white/20 bg-black/70 p-1 backdrop-blur-sm sm:flex">
        <AnimatedExpandButton
          icon={<Download className="h-4 w-4" />}
          text={isSaving ? 'saving...' : 'export'}
          collapsedWidth="2rem"
          expandedWidth="5.5rem"
          disabled={!hasMessages || isSaving}
          onClick={handleExport}
          className="h-8 rounded-full text-xs"
        />
        <AnimatedExpandButton
          icon={devReasoningView ? <User className="h-4 w-4" /> : <Code className="h-4 w-4" />}
          text={devReasoningView ? 'user view' : 'dev view'}
          collapsedWidth="2rem"
          expandedWidth="6rem"
          onClick={toggleDevReasoningView}
          className="h-8 rounded-full text-xs"
        />
        {isAdmin && (
          <AnimatedExpandButton
            icon={<Settings className="h-4 w-4" />}
            text="admin"
            collapsedWidth="2rem"
            expandedWidth="5rem"
            href="/admin"
            className="h-8 rounded-full text-xs"
          />
        )}
      </div>

      {/* Status messages */}
      {lastExportInfo && (
        <div className="pointer-events-auto rounded-lg bg-emerald-500/20 px-3 py-2 text-[10px] font-mono text-emerald-100 backdrop-blur-sm">
          <span>Saved to {lastExportInfo.label}</span>
          {lastExportInfo.url && (
            <>
              {' '}
              <a
                href={lastExportInfo.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-emerald-200/70 underline-offset-2 hover:text-emerald-50"
              >
                Download
              </a>
            </>
          )}
        </div>
      )}
      {errorMessage && (
        <div className="pointer-events-auto rounded-lg bg-red-500/20 px-3 py-2 text-[10px] font-mono text-red-100 backdrop-blur-sm">
          {errorMessage}
        </div>
      )}
    </div>,
    portalTarget
  );
}
