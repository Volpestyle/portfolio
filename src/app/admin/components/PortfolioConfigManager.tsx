'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

type RepoRow = {
  name: string;
  owner: string;
  description?: string | null;
  private: boolean;
  html_url?: string;
  language?: string | null;
  topics?: string[];
  selected: boolean;
  isStarred: boolean;
  icon?: string;
  missing?: boolean;
  order?: number;
  updatedAt?: string;
};

type ApiRepo = Omit<RepoRow, 'selected' | 'isStarred' | 'icon' | 'missing'>;

type StoredProject = {
  name: string;
  owner?: string;
  description?: string;
  isStarred?: boolean;
  icon?: string;
  topics?: string[];
  language?: string;
  visible?: boolean;
  order?: number;
  updatedAt?: string;
};

export function PortfolioConfigManager() {
  const buildKey = (name: string, owner?: string) => `${(owner || '').toLowerCase()}/${name.toLowerCase()}`;
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [projectsRes, reposRes] = await Promise.all([
          fetch('/api/admin/projects'),
          fetch('/api/admin/portfolio/repos'),
        ]);

        if (!projectsRes.ok) {
          throw new Error('Failed to load saved configuration');
        }
        if (!reposRes.ok) {
          throw new Error('Failed to load GitHub repositories');
        }

        const { projects } = (await projectsRes.json()) as { projects?: StoredProject[] };
        const { repos: availableRepos } = (await reposRes.json()) as { repos: ApiRepo[] };

        const projectMap = new Map(
          (projects ?? []).map((project) => [buildKey(project.name, project.owner || 'volpestyle'), project])
        );
        const seen = new Set<string>();

        const merged: RepoRow[] = availableRepos.map((repo, index) => {
          const key = buildKey(repo.name, repo.owner);
          const existing = projectMap.get(key);
          seen.add(key);
          return {
            ...repo,
            selected: existing ? existing.visible !== false : false,
            isStarred: Boolean(existing?.isStarred),
            icon: existing?.icon ?? '',
            description: existing?.description ?? repo.description,
            topics: existing?.topics ?? repo.topics,
            language: existing?.language ?? repo.language,
            order: existing?.order ?? index,
            updatedAt: existing?.updatedAt,
          };
        });

        const missingFromGitHub: RepoRow[] = (projects ?? [])
          .filter((project) => !seen.has(buildKey(project?.name, project?.owner || 'volpestyle')))
          .map((project) => ({
            name: project.name,
            owner: project.owner || 'volpestyle',
            description: project.description ?? 'Configured repo not found in GitHub list',
            private: true,
            html_url: undefined,
            language: project.language,
            topics: project.topics,
            selected: project.visible !== false,
            isStarred: Boolean(project.isStarred),
            icon: project.icon ?? '',
            order: project.order,
            missing: true,
            updatedAt: project.updatedAt,
          }));

        const ordered = [...merged, ...missingFromGitHub].sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
          const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        });

        setRepos(ordered);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load portfolio configuration');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredRepos = useMemo(() => {
    if (!search.trim()) return repos;
    const query = search.toLowerCase();
    return repos.filter((repo) => {
      return (
        repo.name.toLowerCase().includes(query) ||
        repo.owner.toLowerCase().includes(query) ||
        (repo.description ?? '').toLowerCase().includes(query) ||
        (repo.language ?? '').toLowerCase().includes(query)
      );
    });
  }, [repos, search]);

  const selectedCount = useMemo(() => repos.filter((r) => r.selected).length, [repos]);

  const toggleSelected = (name: string, owner: string) => {
    setRepos((prev) =>
      prev.map((repo) =>
        buildKey(repo.name, repo.owner) === buildKey(name, owner)
          ? {
              ...repo,
              selected: !repo.selected,
            }
          : repo
      )
    );
    setStatus(null);
  };

  const updateIcon = (name: string, owner: string, icon: string) => {
    setRepos((prev) =>
      prev.map((repo) =>
        buildKey(repo.name, repo.owner) === buildKey(name, owner)
          ? {
              ...repo,
              icon,
            }
          : repo
      )
    );
    setStatus(null);
  };

  const toggleStar = (name: string, owner: string) => {
    setRepos((prev) =>
      prev.map((repo) =>
        buildKey(repo.name, repo.owner) === buildKey(name, owner)
          ? {
              ...repo,
              isStarred: !repo.isStarred,
              selected: true,
            }
          : repo
      )
    );
    setStatus(null);
  };

  const selectAll = () => {
    setRepos((prev) => prev.map((repo) => ({ ...repo, selected: true })));
    setStatus(null);
  };

  const clearSelection = () => {
    setRepos((prev) => prev.map((repo) => ({ ...repo, selected: false, isStarred: false })));
    setStatus(null);
  };

  // Reorder functions
  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setRepos((prev) => {
      const newRepos = [...prev];
      [newRepos[index - 1], newRepos[index]] = [newRepos[index], newRepos[index - 1]];
      return newRepos;
    });
    setStatus(null);
  }, []);

  const moveDown = useCallback((index: number) => {
    setRepos((prev) => {
      if (index >= prev.length - 1) return prev;
      const newRepos = [...prev];
      [newRepos[index], newRepos[index + 1]] = [newRepos[index + 1], newRepos[index]];
      return newRepos;
    });
    setStatus(null);
  }, []);

  // Get the most recent update timestamp from all repos
  const lastUpdated = useMemo(() => {
    const timestamps = repos
      .map((r) => r.updatedAt)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime())
      .filter((t) => !Number.isNaN(t));
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toLocaleString();
  }, [repos]);

  const save = async () => {
    const selectedRepos = repos.filter((repo) => repo.selected);
    if (!selectedRepos.length) {
      setError('Select at least one repository to save.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const payload = {
        projects: repos.map((repo, index) => ({
          name: repo.name,
          owner: repo.owner,
          description: repo.description ?? undefined,
          isStarred: repo.isStarred,
          icon: repo.icon || undefined,
          topics: repo.topics,
          language: repo.language ?? undefined,
          visible: repo.selected,
          order: index,
        })),
      };

      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save configuration');
      }

      setStatus('Configuration saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-white/20 bg-black/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Portfolio Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white/60">Loading repositories...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/20 bg-black/40 backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-white">Portfolio Configuration</CardTitle>
          <p className="text-sm text-white/60">Select repos to feature and set optional icons</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repos..."
            className="w-full min-w-[200px] bg-white/5 text-white"
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={selectAll} disabled={!repos.length}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clearSelection} disabled={!repos.length}>
              Clear
            </Button>
            <Button onClick={save} disabled={saving} variant="onBlack">
              {saving ? 'Saving...' : 'Save config'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {status ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {status}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-white/60">
          <span>{repos.length} repos loaded</span>
          <div className="flex items-center gap-4">
            {lastUpdated && <span className="text-xs">Last saved: {lastUpdated}</span>}
            <span>{selectedCount} selected</span>
          </div>
        </div>

        {/* Empty state for no repos selected */}
        {repos.length > 0 && selectedCount === 0 && (
          <div className="rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5 px-4 py-6 text-center">
            <p className="text-sm text-yellow-200">No repos selected</p>
            <p className="mt-1 text-xs text-white/50">
              Select repos below to feature them in your portfolio, then click Save config.
            </p>
            <Button variant="onBlack" size="sm" onClick={selectAll} className="mt-3">
              Select all repos
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {filteredRepos.map((repo) => {
            // Find the actual index in the full repos array for reordering
            const actualIndex = repos.findIndex(
              (r) => buildKey(r.name, r.owner) === buildKey(repo.name, repo.owner)
            );
            return (
            <div
              key={`${repo.owner}/${repo.name}`}
              className="rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* Reorder controls */}
                <div className="flex flex-col items-center justify-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => moveUp(actualIndex)}
                    disabled={actualIndex === 0}
                    className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <GripVertical className="h-4 w-4 text-white/20" />
                  <button
                    type="button"
                    onClick={() => moveDown(actualIndex)}
                    disabled={actualIndex === repos.length - 1}
                    className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-white"
                        checked={repo.selected}
                        onChange={() => toggleSelected(repo.name, repo.owner)}
                      />
                      <span className="font-semibold text-white">{repo.name}</span>
                    </label>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{repo.owner}</span>
                    {repo.private ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">Private</span>
                    ) : null}
                    {repo.missing ? (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-100">Not found in GitHub</span>
                    ) : null}
                  </div>
                  {repo.description && <p className="text-sm text-white/60">{repo.description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs text-white/50">
                    {repo.language ? <span className="rounded bg-white/10 px-2 py-0.5">{repo.language}</span> : null}
                    {repo.topics?.slice(0, 3).map((topic) => (
                      <span key={topic} className="rounded bg-white/5 px-2 py-0.5 text-white/60">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  <label className="text-xs text-white/60">
                    Icon
                    <Input
                      value={repo.icon ?? ''}
                      onChange={(event) => updateIcon(repo.name, repo.owner, event.target.value)}
                      placeholder="e.g. sparkles"
                      className="mt-1 w-40 bg-white/10 text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-400"
                      checked={repo.isStarred}
                      onChange={() => toggleStar(repo.name, repo.owner)}
                    />
                    Featured
                  </label>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
