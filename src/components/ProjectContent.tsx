'use client';

import { Button } from '@/components/ui/button';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import type { RepoData } from '@/lib/github-server';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { cn, formatDate } from '@/lib/utils';
import { useImageCarousel } from '@/hooks/useImageCarousel';

interface ProjectContentProps {
  pid: string;
  readme: string;
  repoInfo: RepoData;
  breadcrumbsOverride?: { label: string; href?: string }[];
  variant?: 'page' | 'chat';
  onDocLinkClick?: (docPath: string, label?: string) => void;
}

export function ProjectContent({
  pid,
  readme,
  repoInfo,
  breadcrumbsOverride,
  variant = 'page',
  onDocLinkClick,
}: ProjectContentProps) {
  const isChat = variant === 'chat';
  const { allImages, carouselInitialIndex, isCarouselOpen, handleImageClick, closeCarousel } = useImageCarousel({
    readme,
  });

  const breadcrumbs = breadcrumbsOverride ?? [{ label: 'Projects', href: '/projects' }, { label: pid }];

  const enableCarousel = !isChat && allImages.length > 0;

  return (
    <div className="">
      <MarkdownViewer
        content={readme}
        pid={pid}
        breadcrumbs={breadcrumbs}
        handleImageClick={isChat ? undefined : handleImageClick}
        variant={variant}
        onDocLinkClick={onDocLinkClick}
      >
        <div className={cn('mb-6', isChat ? 'px-2' : '')}>
          <div className="mb-3 flex items-center">
            <h1 className={cn('mr-4 font-bold', isChat ? 'text-lg' : 'text-3xl')}>{pid}</h1>
            {repoInfo.private ? (
              <Button
                disabled
                className={cn('cursor-not-allowed bg-gray-600 text-gray-300', isChat ? 'h-9 text-xs' : '')}
              >
                Private Repo
              </Button>
            ) : (
              <Button
                asChild
                className={cn(
                  'group relative overflow-hidden border border-white bg-transparent text-white transition-all duration-300 hover:border-white hover:bg-white hover:text-black',
                  isChat ? 'h-9 w-28 text-xs' : 'h-10 w-10'
                )}
              >
                <a href={repoInfo.html_url} target="_blank" rel="noopener noreferrer">
                  <div className="relative flex h-full w-full items-center justify-center">
                    <span className="absolute whitespace-nowrap text-black opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      View on GitHub
                    </span>
                    <ExternalLinkIcon className="absolute h-5 w-5 transition-all duration-300 group-hover:translate-x-10 group-hover:opacity-0" />
                  </div>
                </a>
              </Button>
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
