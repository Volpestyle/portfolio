'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { ProfileSocialLink, ProjectSummary, ResumeEntry } from '@portfolio/chat-contract';
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
import { cardTransitions, staggerConfig } from '@/lib/animations';
import { getSocialIcon, resolveSocialLink } from '@/lib/profile/socialLinks';

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

  return normalizedIds
    .map((id) => experienceCache[id])
    .filter((exp): exp is ResumeEntry => Boolean(exp && (exp.type === 'experience' || !exp.type)));
}

function useSurfaceEducation(surface: ChatSurfaceState) {
  const { experienceCache } = useChat();
  const normalizedIds = (surface.visibleEducationIds ?? []).map((id) => id?.trim().toLowerCase()).filter(Boolean);

  return normalizedIds
    .map((id) => experienceCache[id])
    .filter((exp): exp is ResumeEntry => Boolean(exp && exp.type === 'education'));
}

function useSurfaceLinks(surface: ChatSurfaceState) {
  const normalizedIds = (surface.visibleLinkIds ?? []).map((id) => id?.trim().toLowerCase()).filter(Boolean);
  const seen = new Set<string>();

  return normalizedIds
    .map((id) => resolveSocialLink(id))
    .filter((link): link is ProfileSocialLink => {
      if (!link) return false;
      const key = link.platform;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function ChatActionSurface({ surface }: { surface: ChatSurfaceState }) {
  const { focusedProject, filteredVisible, highlightedSkills, focusedAutoExpandToken } = useSurfaceProjects(surface);
  const visibleExperiences = useSurfaceExperiences(surface);
  const visibleEducation = useSurfaceEducation(surface);
  const visibleLinks = useSurfaceLinks(surface);

  const hasCardContent =
    Boolean(focusedProject) ||
    filteredVisible.length > 0 ||
    highlightedSkills.length > 0 ||
    visibleExperiences.length > 0 ||
    visibleEducation.length > 0;

  const shouldRender = hasCardContent || visibleLinks.length > 0;
  if (!shouldRender) {
    return null;
  }

  return (
    <>
      {hasCardContent ? (
        <motion.div
          className="-mx-4 mt-3 rounded-xl border-t border-white/10 bg-white/5 px-4 py-2 text-white backdrop-blur-sm sm:mx-0"
          initial="hidden"
          animate="visible"
          variants={staggerConfig.container}
        >
          <motion.div className="space-y-4" variants={staggerConfig.section}>
            {focusedProject ? (
              <motion.section variants={staggerConfig.item}>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Focused project</p>
                <motion.div className="mt-2" variants={staggerConfig.container} initial="hidden" animate="visible">
                  <motion.div variants={staggerConfig.item}>
                    <SurfaceProjectCard project={focusedProject} autoExpandToken={focusedAutoExpandToken} />
                  </motion.div>
                </motion.div>
              </motion.section>
            ) : null}

            {filteredVisible.length ? (
              <motion.section variants={staggerConfig.item}>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Projects </p>
                <motion.div className="mt-2 space-y-3" variants={staggerConfig.container} initial="hidden" animate="visible">
                  {filteredVisible.map((project) => (
                    <motion.div key={`surface-${project.slug ?? project.name}`} variants={staggerConfig.item}>
                      <SurfaceProjectCard project={project} />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.section>
            ) : null}

            {visibleExperiences.length || visibleEducation.length ? (
              <motion.section variants={staggerConfig.item}>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Resume</p>
                <motion.div className="mt-2" variants={staggerConfig.item}>
                  <ExperienceList experiences={visibleExperiences} education={visibleEducation} />
                </motion.div>
              </motion.section>
            ) : null}

            {highlightedSkills.length ? (
              <motion.section variants={staggerConfig.item}>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Skill highlights</p>
                <motion.div className="mt-2 flex flex-wrap gap-2" variants={staggerConfig.container} initial="hidden" animate="visible">
                  {highlightedSkills.map((skill) => (
                    <motion.span
                      key={skill}
                      variants={staggerConfig.item}
                      className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-white/80"
                    >
                      {skill}
                    </motion.span>
                  ))}
                </motion.div>
              </motion.section>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}

      {visibleLinks.length ? (
        <motion.div
          className="mt-3 flex flex-wrap gap-3"
          initial="hidden"
          animate="visible"
          variants={staggerConfig.container}
        >
          {visibleLinks.map((link) => (
            <motion.div key={`surface-link-${link.platform}`} variants={staggerConfig.item}>
              <SurfaceLinkButton link={link} />
            </motion.div>
          ))}
        </motion.div>
      ) : null}
    </>
  );
}

type ActiveDocState = { path: string; label?: string } | null;

function SurfaceLinkButton({ link }: { link: ProfileSocialLink }) {
  const icon = getSocialIcon(link.platform);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="h-10"
      style={{ width: '2.75rem' }}
      animate={{
        width: isHovered ? '8rem' : '2.75rem',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full text-white transition-colors duration-200 hover:bg-white hover:text-black"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          animate={{
            x: isHovered ? 32 : 0,
            opacity: isHovered ? 0 : 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute"
        >
          <SurfaceLinkIcon icon={icon} />
        </motion.div>
        <motion.span
          animate={{
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.15 }}
          className="whitespace-nowrap text-sm font-medium"
        >
          {link.label}
        </motion.span>
      </a>
    </motion.div>
  );
}

function SurfaceLinkIcon({ icon }: { icon: { path: string } }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
        <path d={icon.path} />
      </svg>
    </span>
  );
}

type ViewState = 'card' | 'detail' | 'document';

function SurfaceProjectCard({
  project,
  autoExpandToken,
}: {
  project: ProjectSummary;
  autoExpandToken?: string | null;
}) {
  const projectId = project.slug ?? project.name;
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeDoc, setActiveDoc] = useState<ActiveDocState>(null);
  const { data: detail, isLoading, isError } = useProjectDetail(projectId, { enabled: isExpanded });
  const { data: repoInfo } = useProjectRepo(projectId);
  const {
    data: document,
    isLoading: isDocLoading,
    isError: docError,
  } = useProjectDocument(projectId, activeDoc?.path, { enabled: isExpanded && Boolean(activeDoc?.path) });
  const autoExpandRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stableHeight, setStableHeight] = useState<number | null>(null);
  const lastStableHeightRef = useRef<number | null>(null);

  const viewState: ViewState = !isExpanded ? 'card' : activeDoc ? 'document' : 'detail';
  const isLoadingState = (viewState === 'detail' && isLoading) || (viewState === 'document' && isDocLoading);

  useEffect(() => {
    if (autoExpandToken && (autoExpandToken !== autoExpandRef.current || !isExpanded)) {
      autoExpandRef.current = autoExpandToken;
      setIsExpanded(true);
      return;
    }

    if (!autoExpandToken && autoExpandRef.current) {
      autoExpandRef.current = null;
      setIsExpanded(false);
    }
  }, [autoExpandToken, isExpanded]);

  useEffect(() => {
    if (!isExpanded) {
      setActiveDoc(null);
    }
  }, [isExpanded]);

  // Track the last rendered height so layout animation skips the loading placeholder size.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const nextHeight = node.getBoundingClientRect().height;
    if (!nextHeight) {
      return;
    }

    if (!isLoadingState) {
      if (!lastStableHeightRef.current || Math.abs(lastStableHeightRef.current - nextHeight) >= 1) {
        lastStableHeightRef.current = nextHeight;
        setStableHeight(nextHeight);
      }
      return;
    }

    if (lastStableHeightRef.current && (!stableHeight || Math.abs(stableHeight - lastStableHeightRef.current) >= 1)) {
      setStableHeight(lastStableHeightRef.current);
    }
  }, [isLoadingState, viewState, detail, document, isError, docError, stableHeight]);

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
  const bodyLayoutId = `${layoutId}-body`;

  // Content variants - subtle opacity fade only
  const contentVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
  const fadeMotionProps = {
    variants: contentVariants,
    initial: 'initial' as const,
    animate: 'animate' as const,
    exit: 'exit' as const,
    transition: cardTransitions.crossfade,
  };

  return (
    <LayoutGroup id={layoutId}>
      <motion.div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm transition-colors duration-300 hover:border-white/20 hover:bg-black/40"
        layout
        initial={false}
        transition={cardTransitions.layout}
        style={{
          minHeight: isLoadingState && stableHeight ? stableHeight : undefined,
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {viewState === 'card' && (
            <motion.div key="card" {...fadeMotionProps}>
              <motion.div layoutId={bodyLayoutId} transition={cardTransitions.layout}>
                <ProjectCard
                  project={project}
                  repo={repoForCard}
                  variant="chat"
                  onOpen={handleExpand}
                  isExpanded={isExpanded}
                  layoutId={layoutId}
                />
              </motion.div>
            </motion.div>
          )}

          {viewState === 'detail' && (
            <motion.div key="detail" {...fadeMotionProps}>
              <AnimatePresence mode="wait" initial={false}>
                {isLoading ? (
                  <div
                    key="detail-loading"
                    className="flex min-h-[200px] items-center justify-center"
                    {...fadeMotionProps}
                  >
                    <Spinner size="md" variant="ring" />
                  </div>
                ) : isError || !detail ? (
                  <motion.div key="detail-error" className="p-4" {...fadeMotionProps}>
                    <p className="text-sm text-white/70">Unable to load project details right now. Please try again.</p>
                    <button
                      onClick={collapseToCard}
                      className="mt-2 text-xs uppercase tracking-wide text-white/60 transition hover:text-white"
                    >
                      Back to cards
                    </button>
                  </motion.div>
                ) : (
                  <motion.div layoutId={bodyLayoutId} transition={cardTransitions.layout}>
                    <ProjectInlineDetails
                      detail={detail}
                      breadcrumbsOverride={breadcrumbs}
                      onDocLinkClick={handleDocLinkClick}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {viewState === 'document' && (
            <motion.div key={`doc-${activeDoc?.path ?? 'none'}`} {...fadeMotionProps}>
              <AnimatePresence mode="wait" initial={false}>
                {isDocLoading ? (
                  <motion.div
                    key="doc-loading"
                    className="flex min-h-[200px] items-center justify-center"
                    {...fadeMotionProps}
                  >
                    <Spinner size="md" variant="ring" />
                  </motion.div>
                ) : docError || !document ? (
                  <motion.div key="doc-error" className="p-4" {...fadeMotionProps}>
                    <p className="text-sm text-white/70">Unable to load that document. Please try another link.</p>
                    <button
                      onClick={backToDetail}
                      className="mt-2 text-xs uppercase tracking-wide text-white/60 transition hover:text-white"
                    >
                      Back to project
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="doc-content" layoutId={bodyLayoutId} transition={cardTransitions.layout}>
                    <DocumentInlinePanel
                      repo={document.repoName}
                      title={document.title}
                      path={document.path}
                      content={document.content}
                      breadcrumbsOverride={docBreadcrumbs ?? undefined}
                      onDocLinkClick={handleDocLinkClick}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}
