'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Upload, Eye } from 'lucide-react';

type ChatExport = {
  key: string;
  bucket: string;
  size?: number;
  lastModified?: string;
  downloadUrl?: string;
};

type ChatLogMetadata = {
  filename: string;
  s3Key: string;
  timestamp: string;
  sessionId: string;
  messageCount: number;
  tags: string[];
  size: number;
};

type CombinedExport = ChatExport & {
  metadata?: ChatLogMetadata;
};

type LogDetailData = {
  log: ChatLogMetadata;
  body: string | null;
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
  const [exportsList, setExportsList] = useState<CombinedExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Detail drawer state
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<LogDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);

  // Upload form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadJson, setUploadJson] = useState('');
  const [uploadSessionId, setUploadSessionId] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [exportsRes, metadataRes] = await Promise.all([
        fetch('/api/admin/chat-exports', { cache: 'no-store' }),
        fetch('/api/admin/logs', { cache: 'no-store' }),
      ]);

      const exportsData = (await exportsRes.json()) as { exports?: ChatExport[]; error?: string };
      const metadataData = (await metadataRes.json()) as { logs?: ChatLogMetadata[]; error?: string };

      if (!exportsRes.ok) {
        throw new Error(exportsData?.error || 'Failed to load exports.');
      }

      const exports = Array.isArray(exportsData?.exports) ? exportsData.exports : [];
      const metadata = Array.isArray(metadataData?.logs) ? metadataData.logs : [];

      // Create a map of metadata by filename for quick lookup
      const metadataMap = new Map<string, ChatLogMetadata>();
      metadata.forEach((m) => metadataMap.set(m.filename, m));

      // Combine exports with metadata
      const combined: CombinedExport[] = exports.map((exp) => {
        const filename = extractFilename(exp.key);
        return {
          ...exp,
          metadata: metadataMap.get(filename),
        };
      });

      setExportsList(combined);
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

  // Fetch log detail
  const fetchLogDetail = useCallback(async (filename: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/admin/logs/${encodeURIComponent(filename)}`);
      const data = (await response.json()) as { log?: ChatLogMetadata; body?: string | null; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load log detail');
      }
      if (data.log) {
        setDetailData({ log: data.log, body: data.body ?? null });
        setEditingTags(data.log.tags ?? []);
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load log detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Open detail drawer
  const openDetail = useCallback((filename: string) => {
    setSelectedLog(filename);
    setDetailData(null);
    setDetailError(null);
    fetchLogDetail(filename);
  }, [fetchLogDetail]);

  // Close detail drawer
  const closeDetail = useCallback(() => {
    setSelectedLog(null);
    setDetailData(null);
    setDetailError(null);
    setEditingTags([]);
    setNewTag('');
  }, []);

  // Save tags
  const saveTags = useCallback(async () => {
    if (!selectedLog) return;
    setSavingTags(true);
    try {
      const response = await fetch(`/api/admin/logs/${encodeURIComponent(selectedLog)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editingTags }),
      });
      const data = (await response.json()) as { log?: ChatLogMetadata; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save tags');
      }
      if (data.log) {
        setDetailData((prev) => prev ? { ...prev, log: data.log! } : null);
        // Update the main list
        setExportsList((prev) =>
          prev.map((exp) =>
            extractFilename(exp.key) === selectedLog
              ? { ...exp, metadata: exp.metadata ? { ...exp.metadata, tags: data.log!.tags } : undefined }
              : exp
          )
        );
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to save tags');
    } finally {
      setSavingTags(false);
    }
  }, [selectedLog, editingTags]);

  // Add tag
  const addTag = useCallback(() => {
    const tag = newTag.trim();
    if (tag && !editingTags.includes(tag)) {
      setEditingTags((prev) => [...prev, tag]);
      setNewTag('');
    }
  }, [newTag, editingTags]);

  // Remove tag
  const removeTag = useCallback((tag: string) => {
    setEditingTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // Upload log
  const handleUpload = useCallback(async () => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      let parsedLog: unknown;
      try {
        parsedLog = JSON.parse(uploadJson);
      } catch {
        throw new Error('Invalid JSON format');
      }

      const tags = uploadTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const response = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log: parsedLog,
          sessionId: uploadSessionId.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });

      const data = (await response.json()) as { location?: { filename: string }; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to upload log');
      }

      setUploadSuccess(`Log uploaded successfully: ${data.location?.filename ?? 'unknown'}`);
      setUploadJson('');
      setUploadSessionId('');
      setUploadTags('');
      setTimeout(() => setUploadSuccess(null), 3000);
      fetchExports();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload log');
    } finally {
      setUploading(false);
    }
  }, [uploadJson, uploadSessionId, uploadTags, fetchExports]);

  // Filter exports based on tag, session, and date filters
  const filteredExports = useMemo(() => {
    let result = exportsList;

    if (tagFilter.trim()) {
      const tag = tagFilter.trim().toLowerCase();
      result = result.filter((exp) =>
        exp.metadata?.tags.some((t) => t.toLowerCase().includes(tag))
      );
    }

    if (sessionFilter.trim()) {
      const session = sessionFilter.trim().toLowerCase();
      result = result.filter((exp) =>
        exp.metadata?.sessionId.toLowerCase().includes(session)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      result = result.filter((exp) => {
        const timestamp = exp.metadata?.timestamp ?? exp.lastModified;
        if (!timestamp) return false;
        return new Date(timestamp) >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      result = result.filter((exp) => {
        const timestamp = exp.metadata?.timestamp ?? exp.lastModified;
        if (!timestamp) return false;
        return new Date(timestamp) <= end;
      });
    }

    return result;
  }, [exportsList, tagFilter, sessionFilter, startDate, endDate]);

  // Collect all unique tags for display
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    exportsList.forEach((exp) => {
      exp.metadata?.tags.forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [exportsList]);

  const statusLabel = useMemo(() => {
    if (loading) return 'Loading exports…';
    if (error) return 'Unable to load exports';
    if (!exportsList.length) return 'No exports yet';
    if (filteredExports.length !== exportsList.length) {
      return `${filteredExports.length} of ${exportsList.length} exports shown`;
    }
    return `${exportsList.length} export${exportsList.length === 1 ? '' : 's'} ready`;
  }, [error, exportsList.length, filteredExports.length, loading]);

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
          <Button
            onClick={() => setShowUploadForm(!showUploadForm)}
            variant="onBlack"
            size="sm"
            className="gap-1"
          >
            <Upload className="h-3.5 w-3.5" />
            {showUploadForm ? 'Hide Upload' : 'Upload Log'}
          </Button>
          <Button onClick={fetchExports} variant="onBlack" size="sm" disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="rounded-lg border border-white/20 bg-white/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Upload Chat Log</h3>
          <div className="space-y-2">
            <label className="text-xs text-white/60">
              Session ID (optional)
              <Input
                value={uploadSessionId}
                onChange={(e) => setUploadSessionId(e.target.value)}
                placeholder="e.g. user-session-123"
                className="mt-1 border-white/20 bg-black/50 text-sm text-white placeholder:text-white/40"
              />
            </label>
            <label className="text-xs text-white/60">
              Tags (comma-separated, optional)
              <Input
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="e.g. test, debug, feature-x"
                className="mt-1 border-white/20 bg-black/50 text-sm text-white placeholder:text-white/40"
              />
            </label>
            <label className="text-xs text-white/60">
              Log JSON *
              <textarea
                value={uploadJson}
                onChange={(e) => setUploadJson(e.target.value)}
                placeholder='{"messages": [{"role": "user", "content": "Hello"}]}'
                rows={4}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/50 px-3 py-2 font-mono text-xs text-white placeholder:text-white/40"
              />
            </label>
          </div>
          {uploadError && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-xs text-green-400">
              {uploadSuccess}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              variant="default"
              size="sm"
              disabled={uploading || !uploadJson.trim()}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="tag-filter" className="text-xs text-white/60">
            Tag:
          </label>
          {allTags.length > 0 ? (
            <select
              id="tag-filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white"
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-white/40">No tags</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="session-filter" className="text-xs text-white/60">
            Session ID:
          </label>
          <Input
            id="session-filter"
            type="text"
            placeholder="Search session..."
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="h-7 w-40 border-white/20 bg-black/50 text-xs text-white placeholder:text-white/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/60">Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white"
          />
          <span className="text-xs text-white/50">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white"
          />
        </div>
        {(tagFilter || sessionFilter || startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTagFilter('');
              setSessionFilter('');
              setStartDate('');
              setEndDate('');
            }}
            className="h-7 text-xs text-white/60 hover:text-white"
          >
            Clear filters
          </Button>
        )}
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
      ) : filteredExports.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">
          {exportsList.length === 0
            ? 'No chat exports saved yet. Export a chat from the chatbot to see it here.'
            : 'No exports match the current filters.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/20">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-white">File</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Saved At</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Messages</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Tags</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredExports.map((item) => (
                <tr key={item.key} className="hover:bg-white/5">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-white">{extractFilename(item.key)}</div>
                    <div className="font-mono text-[11px] text-white/50">Key: {item.key}</div>
                    {item.metadata?.sessionId && (
                      <div className="font-mono text-[11px] text-white/50">
                        Session: {item.metadata.sessionId}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-white/60">
                    {formatTimestamp(item.metadata?.timestamp ?? item.lastModified)}
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-white/60">
                    {formatSize(item.metadata?.size ?? item.size)}
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-white/60">
                    {item.metadata?.messageCount ?? '—'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {item.metadata?.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {item.metadata.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(extractFilename(item.key))}
                        className="inline-flex items-center gap-1 text-blue-400 underline-offset-2 hover:text-blue-300 hover:underline text-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      {item.downloadUrl ? (
                        <a
                          href={item.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 underline-offset-2 hover:text-blue-300 hover:underline text-sm"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-white/40">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            onClick={closeDetail}
            onKeyDown={(e) => e.key === 'Escape' && closeDetail()}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl overflow-y-auto bg-neutral-900 border-l border-white/20 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/20 bg-neutral-900 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Log Detail</h2>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading && (
                <div className="text-sm text-white/50">Loading log details...</div>
              )}

              {detailError && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {detailError}
                </div>
              )}

              {detailData && (
                <>
                  {/* Metadata */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-white">Metadata</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-white/50">Filename:</span>
                        <p className="font-mono text-white">{detailData.log.filename}</p>
                      </div>
                      <div>
                        <span className="text-white/50">Session ID:</span>
                        <p className="font-mono text-white">{detailData.log.sessionId}</p>
                      </div>
                      <div>
                        <span className="text-white/50">Timestamp:</span>
                        <p className="text-white">{formatTimestamp(detailData.log.timestamp)}</p>
                      </div>
                      <div>
                        <span className="text-white/50">Messages:</span>
                        <p className="text-white">{detailData.log.messageCount}</p>
                      </div>
                      <div>
                        <span className="text-white/50">Size:</span>
                        <p className="text-white">{formatSize(detailData.log.size)}</p>
                      </div>
                      <div>
                        <span className="text-white/50">S3 Key:</span>
                        <p className="font-mono text-xs text-white/70 break-all">{detailData.log.s3Key}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tags Editor */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-white">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {editingTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="ml-1 text-white/50 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        placeholder="Add a tag..."
                        className="flex-1 border-white/20 bg-black/50 text-sm text-white placeholder:text-white/40"
                      />
                      <Button onClick={addTag} variant="onBlack" size="sm" disabled={!newTag.trim()}>
                        Add
                      </Button>
                      <Button
                        onClick={saveTags}
                        variant="default"
                        size="sm"
                        disabled={savingTags || JSON.stringify(editingTags) === JSON.stringify(detailData.log.tags)}
                      >
                        {savingTags ? 'Saving...' : 'Save Tags'}
                      </Button>
                    </div>
                  </div>

                  {/* Log Body */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-white">Log Content</h3>
                      {detailData.body && (
                        <span className="text-xs text-white/50">
                          {formatSize(new TextEncoder().encode(detailData.body).length)}
                        </span>
                      )}
                    </div>
                    {detailData.body ? (
                      <pre className="max-h-96 overflow-auto rounded-lg border border-white/20 bg-black/50 p-4 font-mono text-xs text-white/80">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(detailData.body), null, 2);
                          } catch {
                            return detailData.body;
                          }
                        })()}
                      </pre>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">
                        Log body not available
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
