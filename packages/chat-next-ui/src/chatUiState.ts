import { useCallback, useState } from 'react';

export type ChatSurfaceState = {
  anchorId: string;
  visibleProjectIds: string[];
  visibleExperienceIds: string[];
  visibleEducationIds: string[];
  visibleLinkIds: string[];
  focusedProjectId: string | null;
  highlightedSkills: string[];
  lastActionAt: string | null;
};

export type ChatUiState = {
  surfaces: ChatSurfaceState[];
};

export type ApplyUiActionOptions = {
  anchorItemId?: string | null;
  ui?: {
    showProjects?: string[];
    showExperiences?: string[];
    showLinks?: string[];
    showEducation?: string[];
  };
  timestamp?: string;
};

export function useChatUiState(initialState: ChatUiState = { surfaces: [] }) {
  const [uiState, setUiState] = useState<ChatUiState>(initialState);

  const applyUiActions = useCallback((options?: ApplyUiActionOptions) => {
    setUiState((prev) => reduceChatUiState(prev, options));
  }, []);

  return { uiState, applyUiActions };
}

export function reduceChatUiState(prev: ChatUiState, options?: ApplyUiActionOptions): ChatUiState {
  if (!options?.anchorItemId && !options?.ui) {
    return prev;
  }

  const anchorId = options?.anchorItemId ?? null;
  if (!anchorId) {
    return prev;
  }

  const prevSurfaces = prev.surfaces ?? [];
  const existingIndex = prevSurfaces.findIndex((surface) => surface.anchorId === anchorId);

  if (!options?.ui) {
    if (existingIndex === -1) {
      return prev;
    }
    const trimmed = prevSurfaces.filter((surface) => surface.anchorId !== anchorId);
    if (trimmed.length === prevSurfaces.length) {
      return prev;
    }
    return { surfaces: trimmed };
  }

  const baseSurface = existingIndex !== -1 ? prevSurfaces[existingIndex] : createEmptySurface(anchorId);

  let nextVisible = baseSurface.visibleProjectIds ?? [];
  let nextVisibleExperiences = baseSurface.visibleExperienceIds ?? [];
  let nextVisibleEducation = baseSurface.visibleEducationIds ?? [];
  let nextVisibleLinks = baseSurface.visibleLinkIds ?? [];
  const nextFocused: string | null = null;
  const nextSkills: string[] = [];
  let mutated = false;

  if (options?.ui) {
    if (Array.isArray(options.ui.showProjects)) {
      const dedupedProjects = dedupeIdentifiers(options.ui.showProjects);
      if (!arraysEqual(dedupedProjects, nextVisible)) {
        nextVisible = dedupedProjects;
        mutated = true;
      }
    }

    if (Array.isArray(options.ui.showExperiences)) {
      const dedupedExperiences = dedupeIdentifiers(options.ui.showExperiences);
      if (!arraysEqual(dedupedExperiences, nextVisibleExperiences)) {
        nextVisibleExperiences = dedupedExperiences;
        mutated = true;
      }
    }

    if (Array.isArray(options.ui.showEducation)) {
      const dedupedEducation = dedupeIdentifiers(options.ui.showEducation);
      if (!arraysEqual(dedupedEducation, nextVisibleEducation)) {
        nextVisibleEducation = dedupedEducation;
        mutated = true;
      }
    }

    if (Array.isArray(options.ui.showLinks)) {
      const dedupedLinks = dedupeIdentifiers(options.ui.showLinks);
      if (!arraysEqual(dedupedLinks, nextVisibleLinks)) {
        nextVisibleLinks = dedupedLinks;
        mutated = true;
      }
    }

  }

  const hasPayload =
    (nextVisible?.length ?? 0) > 0 ||
    (nextVisibleExperiences?.length ?? 0) > 0 ||
    (nextVisibleEducation?.length ?? 0) > 0 ||
    (nextVisibleLinks?.length ?? 0) > 0 ||
    Boolean(nextFocused);

  if (!hasPayload) {
    if (existingIndex === -1) {
      return prev;
    }
    const trimmed = prevSurfaces.filter((surface) => surface.anchorId !== anchorId);
    if (trimmed.length === prevSurfaces.length) {
      return prev;
    }
    return { surfaces: trimmed };
  }

  if (!mutated && existingIndex !== -1) {
    return prev;
  }

  const updatedSurface: ChatSurfaceState = {
    anchorId,
    visibleProjectIds: nextVisible,
    visibleExperienceIds: nextVisibleExperiences,
    visibleEducationIds: nextVisibleEducation,
    visibleLinkIds: nextVisibleLinks,
    focusedProjectId: nextFocused ?? null,
    highlightedSkills: nextSkills,
    lastActionAt: options?.timestamp ?? new Date().toISOString(),
  };

  if (existingIndex !== -1) {
    const nextSurfaces = [...prevSurfaces];
    nextSurfaces[existingIndex] = updatedSurface;
    return { surfaces: nextSurfaces };
  }

  return { surfaces: [...prevSurfaces, updatedSurface] };
}

function createEmptySurface(anchorId: string): ChatSurfaceState {
  return {
    anchorId,
    visibleProjectIds: [],
    visibleExperienceIds: [],
    visibleEducationIds: [],
    visibleLinkIds: [],
    focusedProjectId: null,
    highlightedSkills: [],
    lastActionAt: null,
  };
}

function dedupeIdentifiers(values?: string[]): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const normalized = normalizeId(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function normalizeId(value?: string) {
  return typeof value === 'string' ? value.trim() : '';
}

function arraysEqual(a: string[], b: string[]) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let idx = 0; idx < a.length; idx += 1) {
    if (a[idx] !== b[idx]) {
      return false;
    }
  }
  return true;
}
