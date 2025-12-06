'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion';
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
import { CollapsibleSection } from '@/components/chat/CollapsibleSection';
import { FolderKanban, FileText, Sparkles } from 'lucide-react';
import { cardTransitions, staggerConfig } from '@/lib/animations';
import { getSocialIcon, resolveSocialLink } from '@/lib/profile/socialLinks';

function useSurfaceProjects(surface: ChatSurfaceState) {
  const { projectCache } = useChat();
  const { visibleProjectIds, highlightedSkills } = surface;
  const needsProjects = visibleProjectIds.length > 0;
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

  const visibleProjects = useMemo(() => {
    if (!visibleProjectIds.length) {
      return [] as ProjectSummary[];
    }
    return visibleProjectIds
      .map((id) => lookupProject(id))
      .filter((project): project is ProjectSummary => Boolean(project))
      .slice(0, 4);
  }, [lookupProject, visibleProjectIds]);

  return { visibleProjects, highlightedSkills };
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
  const { visibleProjects, highlightedSkills } = useSurfaceProjects(surface);
  const visibleExperiences = useSurfaceExperiences(surface);
  const visibleEducation = useSurfaceEducation(surface);
  const visibleLinks = useSurfaceLinks(surface);

  const hasCardContent =
    visibleProjects.length > 0 ||
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
            {visibleProjects.length ? (
              <CollapsibleSection title="Projects" icon={<FolderKanban className="h-3 w-3" />}>
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {visibleProjects.map((project) => (
                      <motion.div
                        key={`surface-${project.slug ?? project.name}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <SurfaceProjectCard project={project} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CollapsibleSection>
            ) : null}

            {visibleExperiences.length || visibleEducation.length ? (
              <CollapsibleSection title="Resume" icon={<FileText className="h-3 w-3" />}>
                <ExperienceList experiences={visibleExperiences} education={visibleEducation} />
              </CollapsibleSection>
            ) : null}

            {highlightedSkills.length ? (
              <CollapsibleSection title="Skill highlights" icon={<Sparkles className="h-3 w-3" />}>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {highlightedSkills.map((skill) => (
                      <motion.span
                        key={skill}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.25 }}
                        className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-white/80"
                      >
                        {skill}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </CollapsibleSection>
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
  const textRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useLayoutEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.scrollWidth);
    }
  }, [link.label]);

  const collapsedWidth = 44;
  const expandedWidth = textWidth + 24; // px-3 = 12px each side

  return (
    <motion.a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full text-white transition-colors duration-200 hover:bg-white hover:text-black"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={false}
      animate={{ width: isHovered ? expandedWidth : collapsedWidth }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <motion.div
        className="absolute"
        initial={false}
        animate={{ opacity: isHovered ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      >
        <SurfaceLinkIcon icon={icon} />
      </motion.div>
      <motion.span
        ref={textRef}
        className="whitespace-nowrap text-sm font-medium"
        initial={false}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        {link.label}
      </motion.span>
    </motion.a>
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
  const prefersReducedMotion = useReducedMotion();

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const layoutId = `project-${projectId}`;
  const bodyLayoutId = `${layoutId}-body`;

  // Content variants - subtle opacity fade only
  const initialOpacity = prefersReducedMotion ? 1 : 0.05;
  const contentVariants = {
    // Keep a soft fade on entry without fully hiding content even if animations are skipped
    initial: { opacity: initialOpacity },
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
