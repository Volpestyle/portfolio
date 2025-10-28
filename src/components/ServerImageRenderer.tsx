'use client';

import Image from 'next/image';

interface ServerImageRendererProps {
  src: string;
  alt: string;
  onImageClick?: (src: string) => void;
  onImageLoad?: () => void;
  className?: string;
}

/**
 * A server-side image renderer component that displays images without client-side fetching
 * Images should already have their URLs resolved on the server
 */
export function ServerImageRenderer({
  src,
  alt,
  onImageClick,
  onImageLoad,
  className,
}: ServerImageRendererProps) {
  const isLocalImage = src.startsWith('/');

  return (
    <div className="py-4">
      <Image
        src={src}
        alt={alt}
        width={isLocalImage ? 1200 : 800}
        height={isLocalImage ? 900 : 600}
        className={`h-auto w-auto max-w-full cursor-pointer ${className || ''}`}
        onClick={() => onImageClick?.(src)}
        onLoad={() => onImageLoad?.()}
        sizes="(max-width: 640px) 90vw, (max-width: 1024px) 75vw, 50vw"
        priority={isLocalImage}
        loading={isLocalImage ? 'eager' : 'lazy'}
      />
    </div>
  );
}
