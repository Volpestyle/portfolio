'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
};

type ApiRepo = Omit<RepoRow, 'selected' | 'isStarred' | 'icon' | 'missing'>;

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

        const [configRes, reposRes] = await Promise.all([
          fetch('/api/admin/portfolio/config'),
          fetch('/api/admin/portfolio/repos'),
        ]);

        if (!configRes.ok) {
          throw new Error('Failed to load saved configuration');
        }
        if (!reposRes.ok) {
          throw new Error('Failed to load GitHub repositories');
        }

        const { config } = (await configRes.json()) as { config?: { repositories?: any[] } };
        const { repos: availableRepos } = (await reposRes.json()) as { repos: ApiRepo[] };

        const configMap = new Map(
          (config?.repositories ?? []).map((repo) => [buildKey(repo.name, repo.owner), repo])
        );
        const seen = new Set<string>();

        const merged: RepoRow[] = availableRepos.map((repo) => {
          const key = buildKey(repo.name, repo.owner);
          const existing = configMap.get(key);
          seen.add(key);
          return {
            ...repo,
            selected: Boolean(existing),
            isStarred: Boolean(existing?.isStarred),
            icon: existing?.icon ?? '',
          };
        });

        const missingFromGitHub: RepoRow[] = (config?.repositories ?? [])
          .filter((repo) => !seen.has(buildKey(repo?.name, repo?.owner)))
          .map((repo) => ({
            name: repo.name,
            owner: repo.owner || 'volpestyle',
            description: repo.description ?? 'Configured repo not found in GitHub list',
            private: Boolean(repo.isPrivate),
            html_url: undefined,
            language: repo.language,
            topics: repo.topics,
            selected: true,
            isStarred: Boolean(repo.isStarred),
            icon: repo.icon ?? '',
            missing: true,
          }));

        setRepos([...merged, ...missingFromGitHub]);
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
        repositories: selectedRepos.map((repo) => ({
          name: repo.name,
          owner: repo.owner,
          description: repo.description,
          isPrivate: repo.private,
          isStarred: repo.isStarred,
          icon: repo.icon,
          topics: repo.topics,
          language: repo.language,
          homepage: repo.html_url,
        })),
      };

      const response = await fetch('/api/admin/portfolio/config', {
        method: 'PUT',
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
          <span>{selectedCount} selected</span>
        </div>

        <div className="space-y-3">
          {filteredRepos.map((repo) => (
            <div
              key={`${repo.owner}/${repo.name}`}
              className="rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
