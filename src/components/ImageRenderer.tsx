'use client';

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepoDetails, getGithubRawUrl, useGithubImage } from '@/lib/github';
import { GITHUB_CONFIG } from '@/lib/constants';
import Image from 'next/image';

interface ImageRendererProps {
  src: string;
  alt: string;
  pid: string;
  width?: number;
  height?: number;
  onImageLoad?: (src: string) => void;
  onImageClick?: (src: string) => void;
  [key: string]: any;
}

/**
 * A component that renders an image from either a direct URL or a GitHub repository.
 * @param {string} src - The source path or URL of the image
 * @param {string} alt - Alt text for the image
 * @param {string} pid - The GitHub repository ID/name
 * @param {number} width - Width of the image
 * @param {number} height - Height of the image
 * @param {function} onImageLoad - Callback fired when image is loaded with final src
 * @param {function} onImageClick - Callback fired when image is clicked
 * @param {object} rest - Additional image props passed through
 */
export function ImageRenderer({ src, alt, pid, onImageClick, onImageLoad, ...props }: ImageRendererProps) {
  const { data: repoData, isLoading: isRepoLoading } = useRepoDetails(GITHUB_CONFIG.USERNAME, pid);
  const { data: imageSrc, isLoading: isImageLoading } = useGithubImage(GITHUB_CONFIG.USERNAME, pid, repoData, src);

  const handleLoad = () => {
    onImageLoad?.(imageSrc!);
  };

  if (isRepoLoading || isImageLoading) {
    return <div className="h-48 w-full animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!imageSrc) return null;

  return (
    <div className="py-4">
      <Image
        src={imageSrc}
        alt={alt}
        width={800}
        height={600}
        unoptimized
        className="h-auto max-w-full cursor-pointer rounded-lg shadow-md transition-opacity hover:opacity-90"
        onClick={() => onImageClick?.(imageSrc)}
        onLoad={() => handleLoad()}
        {...props}
      />
    </div>
  );
}
