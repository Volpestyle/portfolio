'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { ProjectSummary, ResumeEntry } from '@portfolio/chat-contract';
import type { ChatSurfaceState } from '@portfolio/chat-next-ui';
import { useChat } from '@/hooks/useChat';
import { useProjectListCache } from '@/hooks/useProjectListCache';
import { ProjectCard } from '@/components/ProjectCard';
import { normalizeProjectKey } from '@/lib/projects/normalize';
import { useProjectRepo } from '@/hooks/useProjectRepo';
import { ProjectInlineDetails } from '@/components/chat/attachments/ProjectInlineDetails';
import { DocumentInlinePanel } from '@/components/chat/attachments/DocumentInlinePanel';
import { Spinner } from '@/components/ui/spinner';
import { useProjectDetail } from '@/hooks/useProjectDetail';
import { useProjectDocument } from '@/hooks/useProjectDocument';
import { ExperienceList } from '@/components/chat/attachments/ExperienceList';
import { cardTransitions } from '@/lib/animations';

function useSurfaceProjects(surface: ChatSurfaceState) {
  const { projectCache } = useChat();
  const { visibleProjectIds, focusedProjectId, highlightedSkills, lastActionAt } = surface;
  const needsProjects = visibleProjectIds.length > 0 || Boolean(focusedProjectId);
  const { getCachedProjectList, ensureProjectList } = useProjectListCache();
  const [fallbackProjects, setFallbackProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    if (!needsProjects) {
      return;
    }

    const cached = getCachedProjectList();
    if (cached?.length) {
      setFallbackProjects(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const hydrated = await ensureProjectList();
        if (!cancelled) {
          setFallbackProjects(hydrated);
        }
      } catch (error) {
        console.warn('[ChatActionSurface] Failed to hydrate project list', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsProjects, ensureProjectList, getCachedProjectList]);

  const lookupProject = useCallback(
    (projectId?: string | null): ProjectSummary | undefined => {
      const key = normalizeProjectKey(projectId);
      if (!key) {
        return undefined;
      }
      return (
        projectCache[key] ??
        fallbackProjects?.find((project) => normalizeProjectKey(project.slug ?? project.name) === key)
      );
    },
    [projectCache, fallbackProjects]
  );

  const focusedProject = useMemo(() => lookupProject(focusedProjectId), [lookupProject, focusedProjectId]);

  const allVisibleProjects = useMemo(() => {
    if (!visibleProjectIds.length) {
      return [] as ProjectSummary[];
    }
    return visibleProjectIds
      .map((id) => lookupProject(id))
      .filter((project): project is ProjectSummary => Boolean(project));
  }, [lookupProject, visibleProjectIds]);

  const filteredVisible = useMemo(() => {
    if (!focusedProject) {
      return allVisibleProjects.slice(0, 4);
    }
    const focusKey = normalizeProjectKey(focusedProject.slug ?? focusedProject.name);
    return allVisibleProjects
      .filter((project) => normalizeProjectKey(project.slug ?? project.name) !== focusKey)
      .slice(0, 4);
  }, [focusedProject, allVisibleProjects]);

  const focusedAutoExpandToken =
    focusedProject && focusedProjectId ? `${normalizeProjectKey(focusedProjectId)}::${lastActionAt ?? ''}` : null;

  return { focusedProject, filteredVisible, highlightedSkills, focusedAutoExpandToken };
}

function useSurfaceExperiences(surface: ChatSurfaceState) {
  const { experienceCache } = useChat();
  const normalizedIds = (surface.visibleExperienceIds ?? []).map((id) => id?.trim().toLowerCase()).filter(Boolean);

  return normalizedIds.map((id) => experienceCache[id]).filter((exp): exp is ResumeEntry => Boolean(exp));
}

export function ChatActionSurface({ surface }: { surface: ChatSurfaceState }) {
  const { focusedProject, filteredVisible, highlightedSkills, focusedAutoExpandToken } = useSurfaceProjects(surface);
  const visibleExperiences = useSurfaceExperiences(surface);

  const shouldRender =
    Boolean(focusedProject) ||
    filteredVisible.length > 0 ||
    highlightedSkills.length > 0 ||
    visibleExperiences.length > 0;
  if (!shouldRender) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border-t border-white/10 bg-white/5 px-4 py-2 text-white backdrop-blur-sm">
      <div className="space-y-4">
        {focusedProject ? (
          <section>
            <p className="text-[11px] uppercase tracking-wide text-white/60">Focused project</p>
            <div className="mt-2">
              <SurfaceProjectCard project={focusedProject} autoExpandToken={focusedAutoExpandToken} />
            </div>
          </section>
        ) : null}

        {filteredVisible.length ? (
          <section>
            <p className="text-[11px] uppercase tracking-wide text-white/60">Projects </p>
            <LayoutGroup>
              <motion.div layout className="mt-2 space-y-3" transition={cardTransitions.layout}>
                {filteredVisible.map((project) => (
                  <SurfaceProjectCard key={`surface-${project.slug ?? project.name}`} project={project} />
                ))}
              </motion.div>
            </LayoutGroup>
          </section>
        ) : null}

        {visibleExperiences.length ? (
          <section>
            <p className="text-[11px] uppercase tracking-wide text-white/60">Resume</p>
            <div className="mt-2">
              <ExperienceList experiences={visibleExperiences} />
            </div>
          </section>
        ) : null}

        {highlightedSkills.length ? (
          <section>
            <p className="text-[11px] uppercase tracking-wide text-white/60">Skill highlights</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {highlightedSkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-white/80"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

type ActiveDocState = { path: string; label?: string } | null;

type ViewState = 'card' | 'detail' | 'document';

function SurfaceProjectCard({
  project,
  autoExpandToken,
}: {
  project: ProjectSummary;
  autoExpandToken?: string | null;
}) {
  const projectId = project.slug ?? project.name;
  const [isExpanded, setIsExpanded] = useState<boolean>(() => Boolean(autoExpandToken));
  const [activeDoc, setActiveDoc] = useState<ActiveDocState>(null);
  const { data: detail, isLoading, isError } = useProjectDetail(projectId, { enabled: isExpanded });
  const { data: repoInfo } = useProjectRepo(projectId);
  const {
    data: document,
    isLoading: isDocLoading,
    isError: docError,
  } = useProjectDocument(projectId, activeDoc?.path, { enabled: isExpanded && Boolean(activeDoc?.path) });
  const autoExpandRef = useRef<string | null>(autoExpandToken ?? null);

  const viewState: ViewState = !isExpanded ? 'card' : activeDoc ? 'document' : 'detail';

  useEffect(() => {
    if (autoExpandToken && autoExpandToken !== autoExpandRef.current) {
      autoExpandRef.current = autoExpandToken;
      setIsExpanded(true);
      return;
    }

    if (!autoExpandToken && autoExpandRef.current) {
      autoExpandRef.current = null;
      setIsExpanded(false);
    }
  }, [autoExpandToken]);

  useEffect(() => {
    if (!isExpanded) {
      setActiveDoc(null);
    }
  }, [isExpanded]);

  const handleDocLinkClick = useCallback((path: string, label?: string) => {
    setActiveDoc({ path, label });
  }, []);

  const collapseToCard = useCallback(() => {
    setActiveDoc(null);
    setIsExpanded(false);
  }, []);

  const backToDetail = useCallback(() => {
    setActiveDoc(null);
  }, []);

  const breadcrumbs = useMemo(
    () => [{ label: 'Projects', onClick: collapseToCard }, { label: project.name }],
    [collapseToCard, project.name]
  );

  const docBreadcrumbs = useMemo(() => {
    if (!activeDoc) {
      return null;
    }
    const docLabel =
      (document?.path && document.path === activeDoc.path && document.title) || activeDoc.label || activeDoc.path;
    return [
      { label: 'Projects', onClick: collapseToCard },
      { label: project.name, onClick: backToDetail },
      { label: docLabel },
    ];
  }, [activeDoc, collapseToCard, backToDetail, document?.path, document?.title, project.name]);

  const repoForCard = detail?.repo ?? repoInfo;

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const layoutId = `project-${projectId}`;

  // Content variants - subtle opacity fade only
  const contentVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm"
      layout
      initial={false}
      transition={cardTransitions.layout}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {viewState === 'card' && (
          <motion.div
            key="card"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={cardTransitions.crossfade}
          >
            <ProjectCard
              project={project}
              repo={repoForCard}
              variant="chat"
              onOpen={handleExpand}
              isExpanded={isExpanded}
              layoutId={layoutId}
            />
          </motion.div>
        )}

        {viewState === 'detail' && (
          <motion.div
            key="detail"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={cardTransitions.crossfade}
          >
            {isLoading ? (
              <motion.div
                className="flex min-h-[200px] items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={cardTransitions.crossfade}
              >
                <Spinner size="md" variant="ring" />
              </motion.div>
            ) : isError || !detail ? (
              <div className="p-4">
                <p className="text-sm text-white/70">Unable to load project details right now. Please try again.</p>
                <button
                  onClick={collapseToCard}
                  className="mt-2 text-xs uppercase tracking-wide text-white/60 transition hover:text-white"
                >
                  Back to cards
                </button>
              </div>
            ) : (
              <ProjectInlineDetails
                detail={detail}
                breadcrumbsOverride={breadcrumbs}
                onDocLinkClick={handleDocLinkClick}
                layoutId={layoutId}
              />
            )}
          </motion.div>
        )}

        {viewState === 'document' && (
          <motion.div
            key={`doc-${activeDoc?.path ?? 'none'}`}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={cardTransitions.crossfade}
          >
            {isDocLoading ? (
              <motion.div
                className="flex min-h-[200px] items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={cardTransitions.crossfade}
              >
                <Spinner size="md" variant="ring" />
              </motion.div>
            ) : docError || !document ? (
              <div className="p-4">
                <p className="text-sm text-white/70">Unable to load that document. Please try another link.</p>
                <button
                  onClick={backToDetail}
                  className="mt-2 text-xs uppercase tracking-wide text-white/60 transition hover:text-white"
                >
                  Back to project
                </button>
              </div>
            ) : (
              <DocumentInlinePanel
                repo={document.repoName}
                title={document.title}
                path={document.path}
                content={document.content}
                breadcrumbsOverride={docBreadcrumbs ?? undefined}
                onDocLinkClick={handleDocLinkClick}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
