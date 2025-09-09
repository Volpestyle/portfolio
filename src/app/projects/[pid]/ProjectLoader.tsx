'use client';

import { useRepoDetails, useRepoReadme } from '@/lib/github';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import { ChevronLeft } from 'lucide-react';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { formatDate } from '@/lib/utils';
import { useImageCarousel } from '@/hooks/useImageCarousel';

export function ProjectLoader({ pid }: { pid: string }) {
  const { data: repoInfo, isLoading: isRepoInfoLoading, error: repoInfoError } = useRepoDetails(pid);
  const { data: readme, isLoading: isReadmeLoading, error: readmeError } = useRepoReadme(pid);

  const { allImages, carouselInitialIndex, isCarouselOpen, handleImageClick, handleImageLoad, closeCarousel } =
    useImageCarousel({ pid, fromDOM: true, enabled: false });

  const breadcrumbs = [{ label: 'Projects', href: '/projects' }, { label: pid }];

  if (readmeError || repoInfoError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-red-500">Error: {readmeError?.message || repoInfoError?.message}</div>
      </div>
    );
  }

  const isLoading = isRepoInfoLoading || isReadmeLoading || !readme || !repoInfo;

  return (
    <>
      <MarkdownViewer
        content={readme || ''}
        pid={pid}
        breadcrumbs={breadcrumbs}
        handleImageClick={handleImageClick}
        handleImageLoad={handleImageLoad}
        isLoading={isLoading}
      >
        {/* Project metadata and actions */}
        <div className="mb-6">
          {repoInfo && (
            <>
              <div className="mb-4 flex items-center">
                <h1 className="mr-4 text-3xl font-bold">{pid}</h1>
                {repoInfo.private ? (
                  <Button disabled className="cursor-not-allowed bg-gray-600 text-gray-300">
                    Private Repo
                  </Button>
                ) : (
                  <div className="group relative inline-block">
                    <Button
                      asChild
                      className="relative h-10 w-10 border border-white bg-transparent text-white transition-all duration-300 hover:w-40 hover:border-white hover:bg-white hover:text-black"
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
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-400">
                <span className="font-bold">Created:</span> {formatDate(repoInfo.created_at)}
              </div>
              <div className="text-sm text-gray-400">
                <span className="font-bold">Last commit:</span> {formatDate(repoInfo.pushed_at)}
              </div>
            </>
          )}
        </div>
      </MarkdownViewer>

      {allImages.length > 0 && (
        <ImageCarousel
          images={allImages}
          initialIndex={carouselInitialIndex}
          isOpen={isCarouselOpen}
          onClose={closeCarousel}
        />
      )}
    </>
  );
}
