'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type ChatExport = {
  key: string;
  bucket: string;
  size?: number;
  lastModified?: string;
  downloadUrl?: string;
};

function formatSize(bytes?: number) {
  if (bytes === undefined || bytes === null) {
    return '—';
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function extractFilename(key: string) {
  const parts = key.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : key;
}

export function ChatExportsClient() {
  const [exportsList, setExportsList] = useState<ChatExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/chat-exports', { cache: 'no-store' });
      const data = (await response.json()) as { exports?: ChatExport[]; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load exports.');
      }
      setExportsList(Array.isArray(data?.exports) ? data.exports : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load exports.');
      setExportsList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const statusLabel = useMemo(() => {
    if (loading) return 'Loading exports…';
    if (error) return 'Unable to load exports';
    if (!exportsList.length) return 'No exports yet';
    return `${exportsList.length} export${exportsList.length === 1 ? '' : 's'} ready`;
  }, [error, exportsList.length, loading]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">{statusLabel}</p>
          <p className="text-xs text-white/50">
            Links expire after several minutes. Click refresh to request fresh download links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchExports} variant="onBlack" size="sm" disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">
          Fetching exports…
        </div>
      ) : exportsList.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">
          No chat exports saved yet. Export a chat from the chatbot to see it here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/20">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-white">File</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Saved At</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {exportsList.map((item) => (
                <tr key={item.key} className="hover:bg-white/5">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-white">{extractFilename(item.key)}</div>
                    <div className="font-mono text-[11px] text-white/50">Key: {item.key}</div>
                    <div className="font-mono text-[11px] text-white/50">Bucket: {item.bucket}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-white/60">{formatTimestamp(item.lastModified)}</td>
                  <td className="px-4 py-3 align-top text-sm text-white/60">{formatSize(item.size)}</td>
                  <td className="px-4 py-3 align-top">
                    {item.downloadUrl ? (
                      <a
                        href={item.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 underline-offset-2 hover:text-blue-300 hover:underline"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-sm text-white/40">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
