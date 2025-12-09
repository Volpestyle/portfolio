'use client';

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
  useRef,
  type DragEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { usePageTransition } from '@/components/PageTransition';

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

type RepoItemProps = {
  repo: RepoRow;
  index: number;
  totalCount: number;
  onToggleSelected: (name: string, owner: string) => void;
  onUpdateIcon: (name: string, owner: string, icon: string) => void;
  onToggleStar: (name: string, owner: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  buildKey: (name: string, owner?: string) => string;
  draggingKey: string | null;
  dragOverKey: string | null;
  dragOverPosition: 'before' | 'after';
  onDragStart: (key: string) => void;
  onDragEnter: (key: string) => void;
  onDragOver: (key: string, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (key: string) => void;
  onDragEnd: () => void;
  itemRef: (node: HTMLDivElement | null) => void;
};

function RepoItem({
  repo,
  index,
  totalCount,
  onToggleSelected,
  onUpdateIcon,
  onToggleStar,
  onMoveUp,
  onMoveDown,
  buildKey,
  draggingKey,
  dragOverKey,
  dragOverPosition,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  itemRef,
}: RepoItemProps) {
  const key = buildKey(repo.name, repo.owner);
  const isDragging = draggingKey === key;
  const isDragOver = dragOverKey === key && !isDragging;
  const showDropIndicator = Boolean(draggingKey && isDragOver);
  const indicatorAfter = dragOverPosition === 'after';

  return (
    <>
      {showDropIndicator && !indicatorAfter ? <div className="h-0.5 rounded-full bg-white/40" /> : null}
      <div
        draggable
        ref={itemRef}
        onDragStart={() => onDragStart(key)}
        onDragEnter={() => onDragEnter(key)}
        onDragOver={(e) => onDragOver(key, e)}
        onDrop={() => onDrop(key)}
        onDragEnd={onDragEnd}
        className={[
          'cursor-grab rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-white/20 active:cursor-grabbing',
          isDragging ? 'opacity-80 ring-2 ring-white/30' : '',
          isDragOver ? 'border-white/30 bg-white/10' : '',
        ].join(' ')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* Reorder controls */}
          <div className="flex flex-col items-center justify-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
              className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <div className="touch-none" title="Drag to reorder">
              <GripVertical className="h-4 w-4 text-white/40 hover:text-white/60" />
            </div>
            <button
              type="button"
              onClick={() => onMoveDown(index)}
              disabled={index === totalCount - 1}
              className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
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
                  onChange={() => onToggleSelected(repo.name, repo.owner)}
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
                onChange={(event) => onUpdateIcon(repo.name, repo.owner, event.target.value)}
                placeholder="e.g. sparkles"
                className="mt-1 w-40 bg-white/10 text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-400"
                checked={repo.isStarred}
                onChange={() => onToggleStar(repo.name, repo.owner)}
              />
              Featured
            </label>
          </div>
        </div>
      </div>
      {showDropIndicator && indicatorAfter ? <div className="h-0.5 rounded-full bg-white/40" /> : null}
    </>
  );
}

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
  const { markReady } = usePageTransition();
  const buildKey = useCallback((name: string, owner?: string) => `${(owner || '').toLowerCase()}/${name.toLowerCase()}`, []);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const prevPositions = useRef<Map<string, DOMRect>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Signal to page transition that we're loading async content
    markReady(false);

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
        // Signal to page transition that content is ready
        markReady(true);
      }
    }

    load();
  }, [markReady]);

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

  const visibleRepos = useMemo(
    () => (search.trim() ? filteredRepos : repos),
    [filteredRepos, repos, search]
  );

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

  const moveItem = useCallback(
    (fromKey: string, toKey: string, position: 'before' | 'after') => {
      if (fromKey === toKey) return;
      setRepos((prev) => {
        const list = [...prev];
        const fromIndex = list.findIndex((repo) => buildKey(repo.name, repo.owner) === fromKey);
        const toIndex = list.findIndex((repo) => buildKey(repo.name, repo.owner) === toKey);
        if (fromIndex === -1 || toIndex === -1) return prev;
        const [item] = list.splice(fromIndex, 1);
        let targetIndex = toIndex + (position === 'after' ? 1 : 0);
        if (fromIndex < targetIndex) {
          targetIndex -= 1;
        }
        list.splice(targetIndex, 0, item);
        return list;
      });
      setStatus(null);
    },
    [buildKey]
  );

  const handleDragStart = useCallback((key: string) => {
    setDraggingKey(key);
    setDragOverKey(null);
    setDragOverPosition('before');
  }, []);

  const handleDragEnter = useCallback(
    (key: string) => {
      if (draggingKey) {
        setDragOverKey(key);
        setDragOverPosition('before');
      }
    },
    [draggingKey]
  );

  const handleDragOver = useCallback(
    (key: string, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggingKey) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const isAfter = event.clientY > rect.top + rect.height / 2;
      setDragOverKey(key);
      setDragOverPosition(isAfter ? 'after' : 'before');
    },
    [draggingKey]
  );

  const findClosestTarget = useCallback(
    (y: number) => {
      const entries = Array.from(itemRefs.current.entries()).filter(([_, node]) => node?.isConnected);
      if (!entries.length) return null;
      const withRects = entries
        .map(([key, node]) => ({ key, rect: node!.getBoundingClientRect() }))
        .sort((a, b) => a.rect.top - b.rect.top);

      for (const entry of withRects) {
        const mid = entry.rect.top + entry.rect.height / 2;
        if (y < mid) {
          return { key: entry.key, position: 'before' as const };
        }
      }
      const last = withRects[withRects.length - 1];
      return { key: last.key, position: 'after' as const };
    },
    []
  );

  const handleListDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggingKey) return;
      event.preventDefault();
      const target = findClosestTarget(event.clientY);
      if (target) {
        setDragOverKey(target.key);
        setDragOverPosition(target.position);
      }
    },
    [draggingKey, findClosestTarget]
  );

  const handleListDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggingKey) return;
      event.preventDefault();
      const target = findClosestTarget(event.clientY) || (dragOverKey ? { key: dragOverKey, position: dragOverPosition } : null);
      if (target) {
        moveItem(draggingKey, target.key, target.position);
      }
      setDraggingKey(null);
      setDragOverKey(null);
      setDragOverPosition('before');
    },
    [dragOverKey, dragOverPosition, draggingKey, findClosestTarget, moveItem]
  );

  const handleDrop = useCallback(
    (key: string) => {
      if (!draggingKey) return;
      moveItem(draggingKey, key, dragOverPosition);
      setDraggingKey(null);
      setDragOverKey(null);
      setDragOverPosition('before');
    },
    [dragOverPosition, draggingKey, moveItem]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingKey(null);
    setDragOverKey(null);
    setDragOverPosition('before');
  }, []);

  // Animate position changes (FLIP-lite)
  useLayoutEffect(() => {
    const newPositions = new Map<string, DOMRect>();
    itemRefs.current.forEach((node, key) => {
      if (node) {
        newPositions.set(key, node.getBoundingClientRect());
      }
    });

    newPositions.forEach((newBox, key) => {
      const prevBox = prevPositions.current.get(key);
      const node = itemRefs.current.get(key);
      if (!node || !prevBox) return;
      const deltaX = prevBox.left - newBox.left;
      const deltaY = prevBox.top - newBox.top;
      if (deltaX !== 0 || deltaY !== 0) {
        node.style.transition = 'none';
        node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        requestAnimationFrame(() => {
          node.style.transition = 'transform 180ms ease';
          node.style.transform = '';
        });
      }
    });

    prevPositions.current = newPositions;
  }, [visibleRepos]);

  const setItemRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (node) {
        itemRefs.current.set(key, node);
      } else {
        itemRefs.current.delete(key);
      }
    },
    []
  );

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

        <div
          ref={listRef}
          className="space-y-3"
          onDragOver={handleListDragOver}
          onDrop={handleListDrop}
        >
          {visibleRepos.map((repo) => {
            const actualIndex = repos.findIndex(
              (r) => buildKey(r.name, r.owner) === buildKey(repo.name, repo.owner)
            );

            return (
              <RepoItem
                key={buildKey(repo.name, repo.owner)}
                repo={repo}
                index={actualIndex}
                totalCount={repos.length}
                draggingKey={draggingKey}
                dragOverKey={dragOverKey}
                dragOverPosition={dragOverPosition}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onToggleSelected={toggleSelected}
                onUpdateIcon={updateIcon}
                onToggleStar={toggleStar}
                onMoveUp={moveUp}
                onMoveDown={moveDown}
                buildKey={buildKey}
                itemRef={setItemRef(buildKey(repo.name, repo.owner))}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
