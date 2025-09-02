'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import { ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { RepoData } from '@/lib/github';
import { MarkdownViewer } from '@/components/MarkdownViewer';

interface ProjectContentProps {
  pid: string;
  readme: string;
  repoInfo: RepoData;
}

function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

export function ProjectContent({ pid, readme, repoInfo }: ProjectContentProps) {
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);

  // get all images from the markdown for carousel
  const { data: allImages = [], refetch: refetchImages } = useQuery({
    queryKey: ['projectImages', pid],
    queryFn: () => {
      return Array.from(document.querySelectorAll('.markdown-body img'))
        .map((img) => {
          const src = (img as HTMLImageElement).src;
          // Convert localhost URLs back to relative paths
          if (src.includes('localhost')) {
            const url = new URL(src);
            return url.pathname;
          }
          return src;
        })
        .filter(Boolean);
    },
    enabled: false,
  });

  const handleImageClick = useCallback(
    (clickedSrc: string) => {
      if (!clickedSrc) return;

      // Normalize the clicked source to match what's in allImages
      let normalizedSrc = clickedSrc;
      if (clickedSrc.includes('localhost')) {
        const url = new URL(clickedSrc);
        normalizedSrc = url.pathname;
      }

      const clickedIndex = allImages.indexOf(normalizedSrc);
      if (allImages.length > 0) {
        setCarouselInitialIndex(clickedIndex >= 0 ? clickedIndex : 0);
        setIsCarouselOpen(true);
      }
    },
    [allImages]
  );

  const handleImageLoad = useCallback(() => {
    refetchImages();
  }, [refetchImages]);

  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: pid }
  ];

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
            <Button variant="ghost" className="mb-6 group">
              <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
              Back to Projects
            </Button>
          </Link>
          
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
        </div>
      </MarkdownViewer>

      {allImages.length > 0 && (
        <ImageCarousel
          images={allImages}
          initialIndex={carouselInitialIndex}
          isOpen={isCarouselOpen}
          onClose={() => setIsCarouselOpen(false)}
        />
      )}
    </>
  );
}
