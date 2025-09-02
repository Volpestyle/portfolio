'use client';

import React from 'react';
import { useRepoDetails, useGithubImage } from '@/lib/github';
import Image from 'next/image';

interface ImageRendererProps {
  pid: string;
  src: string;
  alt: string;
  onImageClick?: (src: string) => void;
  onImageLoad?: () => void;
  className?: string;
}

/**
 * A component that renders an image from either a direct URL or a GitHub repository.
 * @param {string} src - The source path or URL of the image
 * @param {string} alt - Alt text for the image
 * @param {string} pid - The GitHub repository ID/name
 * @param {function} onImageLoad - Callback fired when image is loaded with final src
 * @param {function} onImageClick - Callback fired when image is clicked
 * @param {string} className - Additional CSS classes for the image
 */
export function ImageRenderer({ pid, src, alt, onImageClick, onImageLoad, className }: ImageRendererProps) {
  const { data: repoData, isLoading: isRepoLoading } = useRepoDetails(pid);
  const { data: imageSrc, isLoading: isImageLoading } = useGithubImage(pid, repoData, src);

  const handleLoad = () => {
    onImageLoad?.();
  };

  if (isRepoLoading || isImageLoading) {
    return <div className="h-48 w-full animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!imageSrc) return null;

  // For local paths (starting with /), use img tag instead of Next/Image
  // to avoid hostname configuration issues
  if (imageSrc.startsWith('/')) {
    return (
      <div className="py-4">
        <img
          src={imageSrc}
          alt={alt}
          className={`h-auto w-auto max-w-full cursor-pointer ${className || ''}`}
          onClick={() => onImageClick?.(imageSrc)}
          onLoad={() => handleLoad()}
        />
      </div>
    );
  }

  return (
    <div className="py-4">
      <Image
        src={imageSrc}
        alt={alt}
        width={800}
        height={600}
        unoptimized
        className={`h-auto w-auto max-w-full cursor-pointer ${className || ''}`}
        onClick={() => onImageClick?.(imageSrc)}
        onLoad={() => handleLoad()}
      />
    </div>
  );
}
