'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import ImageRenderer from '@/components/ImageRenderer';
import ImageCarousel from '@/components/ImageCarousel';
import { ExternalLinkIcon } from '@/lib/svgs';
import { CustomLink } from '@/components/CustomLink';
import { ArrowLeft } from 'lucide-react';

interface ProjectContentProps {
  pid: string;
  readme: string;
  repoInfo: {
    url: string;
    created_at: string;
    pushed_at: string;
  };
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
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);

  const handleImageLoad = (src: string) => {
    setCarouselImages((prevImages) => {
      if (!prevImages.includes(src)) {
        return [...prevImages, src];
      }
      return prevImages;
    });
  };

  const handleImageClick = (src: string) => {
    const index = carouselImages.indexOf(src);
    if (index !== -1) {
      setCarouselInitialIndex(index);
      setIsCarouselOpen(true);
    }
  };

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
          <a href={repoInfo.url} target="_blank" rel="noopener noreferrer" className="flex items-center">
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
      <div className="markdown-body text-white">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight]}
          components={{
            img: (props) => (
              <ImageRenderer {...props} pid={pid} onImageLoad={handleImageLoad} onImageClick={handleImageClick} />
            ),
            a: ({ href, children }) => <CustomLink href={href || '#'}>{children}</CustomLink>,
          }}
        >
          {readme}
        </ReactMarkdown>
      </div>
      <ImageCarousel
        images={carouselImages}
        initialIndex={carouselInitialIndex}
        isOpen={isCarouselOpen}
        onClose={() => setIsCarouselOpen(false)}
      />
    </div>
  );
}
