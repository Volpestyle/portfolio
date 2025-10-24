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
  className
}: ServerImageRendererProps) {
  // For local paths (starting with /), use img tag
  if (src.startsWith('/')) {
    return (
      <div className="py-4">
        <img
          src={src}
          alt={alt}
          className={`h-auto w-auto max-w-full cursor-pointer ${className || ''}`}
          onClick={() => onImageClick?.(src)}
          onLoad={() => onImageLoad?.()}
        />
      </div>
    );
  }

  // For external URLs, use Next/Image with unoptimized flag
  return (
    <div className="py-4">
      <Image
        src={src}
        alt={alt}
        width={800}
        height={600}
        unoptimized
        className={`h-auto w-auto max-w-full cursor-pointer ${className || ''}`}
        onClick={() => onImageClick?.(src)}
        onLoad={() => onImageLoad?.()}
      />
    </div>
  );
}