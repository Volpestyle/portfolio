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
                  <Button disabled className="bg-gray-600 text-gray-300 cursor-not-allowed">
                    Private Repo
                  </Button>
                ) : (
                  <Button asChild className="bg-white text-black hover:bg-gray-200">
                    <a href={repoInfo.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center">
                      View on GitHub
                      <ExternalLinkIcon />
                    </a>
                  </Button>
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
