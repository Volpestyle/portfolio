'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import { ChevronLeft } from 'lucide-react';
import { RepoData } from '@/lib/github';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { formatDate } from '@/lib/utils';
import { useImageCarousel } from '@/hooks/useImageCarousel';

interface ProjectContentProps {
  pid: string;
  readme: string;
  repoInfo: RepoData;
}

export function ProjectContent({ pid, readme, repoInfo }: ProjectContentProps) {
  const { allImages, carouselInitialIndex, isCarouselOpen, handleImageClick, handleImageLoad, closeCarousel } =
    useImageCarousel({ pid, fromDOM: true, enabled: false });

  const breadcrumbs = [{ label: 'Projects', href: '/projects' }, { label: pid }];

  return (
    <>
      <MarkdownViewer
        content={readme}
        pid={pid}
        breadcrumbs={breadcrumbs}
        handleImageClick={handleImageClick}
        handleImageLoad={handleImageLoad}
      >
        {/* Project metadata and actions */}
        <div className="mb-6">
          <Link href="/projects">
            <Button variant="ghost" className="group mb-6">
              <ChevronLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              Back to Projects
            </Button>
          </Link>

          <div className="text-sm text-gray-400">
            <span className="font-bold">Created:</span> {formatDate(repoInfo.created_at)}
          </div>
          <div className="text-sm text-gray-400">
            <span className="font-bold">Last commit:</span> {formatDate(repoInfo.pushed_at)}
          </div>
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
