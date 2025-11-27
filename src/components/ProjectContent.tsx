'use client';

import { Button } from '@/components/ui/button';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import type { RepoData } from '@/lib/github-server';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { cn, formatDate } from '@/lib/utils';
import { useImageCarousel } from '@/hooks/useImageCarousel';
import { AnimatedExpandButton } from '@/components/ui/AnimatedExpandButton';
import { LanguageBar } from '@/components/LanguageBar';
import { motion, type Transition } from 'framer-motion';
import { cardTransitions } from '@/lib/animations';

interface BreadcrumbOverride {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ProjectContentProps {
  pid: string;
  readme: string;
  repoInfo: RepoData;
  breadcrumbsOverride?: BreadcrumbOverride[];
  variant?: 'page' | 'chat';
  onDocLinkClick?: (docPath: string, label?: string) => void;
  layoutId?: string;
}

export function ProjectContent({
  pid,
  readme,
  repoInfo,
  breadcrumbsOverride,
  variant = 'page',
  onDocLinkClick,
  layoutId,
}: ProjectContentProps) {
  const isChat = variant === 'chat';
  const { allImages, carouselInitialIndex, isCarouselOpen, handleImageClick, closeCarousel } = useImageCarousel({
    readme,
  });

  const breadcrumbs = breadcrumbsOverride ?? [{ label: 'Projects', href: '/projects' }, { label: pid }];

  const enableCarousel = allImages.length > 0;

  return (
    <div className="">
      <MarkdownViewer
        content={readme}
        pid={pid}
        breadcrumbs={breadcrumbs}
        handleImageClick={enableCarousel ? handleImageClick : undefined}
        variant={variant}
        onDocLinkClick={onDocLinkClick}
      >
        <div className={cn('mb-6', isChat ? 'px-2' : '')}>
          <div className="mb-3 flex items-center">
            <motion.h1
              layoutId={layoutId ? `${layoutId}-title` : undefined}
              className={cn('mr-4 font-bold', isChat ? 'text-lg' : 'text-3xl')}
            >
              {pid}
            </motion.h1>
            {repoInfo.private ? (
              <Button
                disabled
                className={cn('cursor-not-allowed bg-gray-600 text-gray-300', isChat ? 'h-9 text-xs' : '')}
              >
                Private Repo
              </Button>
            ) : (
              <AnimatedExpandButton
                icon={<ExternalLinkIcon className="h-5 w-5" />}
                text="view on github"
                expandedWidth={isChat ? '8rem' : '9rem'}
                href={repoInfo.html_url}
                external
                className={isChat ? 'h-9 text-xs' : 'h-10'}
              />
            )}
          </div>
          <div className={cn('text-gray-400', isChat ? 'text-[11px]' : 'text-sm')}>
            <span className="font-bold">Created:</span> {formatDate(repoInfo.created_at)}
          </div>
          {repoInfo.pushed_at && (
            <div className={cn('text-gray-400', isChat ? 'text-[11px]' : 'text-sm')}>
              <span className="font-bold">Last commit:</span> {formatDate(repoInfo.pushed_at)}
            </div>
          )}

          {repoInfo.languagePercentages && repoInfo.languagePercentages.length > 0 && (
            <div className={cn('mt-4', isChat ? '' : '')}>
              <LanguageBar languages={repoInfo.languagePercentages} maxLabels={isChat ? 3 : 5} />
            </div>
          )}

          {repoInfo.tags && repoInfo.tags.length > 0 && (
            <div className={cn('mt-4 flex flex-wrap gap-2', isChat ? '' : '')}>
              {repoInfo.tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'rounded-full border border-white/20 bg-white/5 text-white/80',
                    isChat ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </MarkdownViewer>

      {enableCarousel && (
        <ImageCarousel
          images={allImages}
          initialIndex={carouselInitialIndex}
          isOpen={isCarouselOpen}
          onClose={closeCarousel}
        />
      )}
    </div>
  );
}
