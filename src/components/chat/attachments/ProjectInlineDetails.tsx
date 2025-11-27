'use client';

import { ProjectContent } from '@/components/ProjectContent';
import { Spinner } from '@/components/ui/spinner';
import type { ProjectDetail } from '@portfolio/chat-contract';
import { useProjectDetail, type ProjectDetailPayload } from '@/hooks/useProjectDetail';

interface ProjectInlineDetailsProps {
  detail?: ProjectDetailPayload;
  project?: ProjectDetail;
  breadcrumbsOverride?: { label: string; href?: string; onClick?: () => void }[];
  onDocLinkClick?: (path: string, label?: string) => void;
  layoutId?: string;
}

export function ProjectInlineDetails({
  detail,
  project,
  breadcrumbsOverride,
  onDocLinkClick,
  layoutId,
}: ProjectInlineDetailsProps) {
  const resolvedProject = detail?.project ?? project;
  const projectId = resolvedProject?.slug ?? resolvedProject?.name ?? '';
  const shouldFetch = !detail && Boolean(projectId);
  const {
    data: fetchedDetail,
    isLoading,
    isError,
  } = useProjectDetail(projectId, {
    enabled: shouldFetch,
  });

  const finalDetail = detail ?? fetchedDetail;

  if (!finalDetail) {
    if (isLoading) {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-sm text-white/70">
            <Spinner size="sm" /> Loading project details…
          </div>
        </div>
      );
    }

    if (isError || !projectId) {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <p className="text-sm text-white/70">Unable to load project details right now. Please try again.</p>
        </div>
      );
    }

    return null;
  }

  return (
    <ProjectContent
      pid={finalDetail.project.slug ?? finalDetail.project.name}
      repoInfo={finalDetail.repo}
      readme={finalDetail.readme}
      variant="chat"
      breadcrumbsOverride={breadcrumbsOverride}
      onDocLinkClick={onDocLinkClick}
      layoutId={layoutId}
    />
  );
}
