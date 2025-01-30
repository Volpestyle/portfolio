'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import { ArrowLeft } from 'lucide-react';
import rehypeRaw from 'rehype-raw';
import { ImageRenderer } from '@/components/ImageRenderer';
import { useQuery } from '@tanstack/react-query';
import { RepoData } from '@/lib/github';

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
        .map((img) => (img as HTMLImageElement).src)
        .filter(Boolean);
    },
    enabled: false,
  });

  const handleImageClick = useCallback(
    (clickedSrc: string) => {
      if (!clickedSrc) return;

      const clickedIndex = allImages.indexOf(clickedSrc);
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

  const markdownComponents = useMemo(
    () => ({
      p: ({ node, children, ...props }: any) => {
        // Check if paragraph contains only image and text nodes
        const containsOnlyImageAndText = node?.children?.every(
          (child: any) => child.tagName === 'img' || (child.type === 'text' && /^[\s.]*$/.test(child.value)) // Only whitespace or dots
        );

        // If it's an image-only paragraph, wrap in div
        if (containsOnlyImageAndText) {
          return <div className="my-4 flex flex-col items-start gap-2">{children}</div>;
        }

        // For mixed content (text + image), ensure proper wrapping
        const hasImage = node?.children?.some((child: any) => child.tagName === 'img');
        if (hasImage) {
          return <div className="my-4">{children}</div>;
        }

        // Regular paragraph
        return <p {...props}>{children}</p>;
      },
      img: ({ src, alt, ...props }: any) => {
        if (!src) return null;
        return (
          <span className="inline-block">
            <ImageRenderer
              pid={pid}
              src={src}
              alt={alt || ''}
              onImageClick={handleImageClick}
              onImageLoad={handleImageLoad}
              {...props}
            />
          </span>
        );
      },
    }),
    [pid, handleImageClick, handleImageLoad]
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Button asChild className="bg-white text-black hover:bg-gray-200">
          <Link href="/projects" className="flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
          </Link>
        </Button>
      </div>
      <div className="mb-4 flex items-center">
        <h1 className="mr-4 text-3xl font-bold">{pid}</h1>
        <Button asChild className="bg-white text-black hover:bg-gray-200">
          <a href={repoInfo.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center">
            View on GitHub
            <ExternalLinkIcon />
          </a>
        </Button>
      </div>
      <div className="text-sm text-gray-400">
        <span className="font-bold">Created:</span> {formatDate(repoInfo.created_at)}
      </div>
      <div className="mb-4 text-sm text-gray-400">
        <span className="font-bold">Last commit:</span> {formatDate(repoInfo.pushed_at)}
      </div>
      <div className="markdown-body preserve-case">
        <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeHighlight]} components={markdownComponents}>
          {readme}
        </ReactMarkdown>
      </div>

      {allImages.length > 0 && (
        <ImageCarousel
          images={allImages}
          initialIndex={carouselInitialIndex}
          isOpen={isCarouselOpen}
          onClose={() => setIsCarouselOpen(false)}
        />
      )}
    </div>
  );
}
