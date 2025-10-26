import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAssetPrefetch } from './useAssetPrefetch';

interface UseImageCarouselOptions {
  readme?: string | undefined;
  enabled?: boolean;
}

const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const htmlImagePattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

function normalizeSrc(src: string | undefined | null): string | null {
  if (!src) {
    return null;
  }

  const trimmed = src.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('localhost')) {
    try {
      const url = new URL(trimmed);
      return url.pathname || trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function extractImagesFromReadme(content: string): string[] {
  const images = new Set<string>();
  let match: RegExpExecArray | null;

  markdownImagePattern.lastIndex = 0;
  while ((match = markdownImagePattern.exec(content)) !== null) {
    const normalized = normalizeSrc(match[1]);
    if (normalized) {
      images.add(normalized);
    }
  }

  htmlImagePattern.lastIndex = 0;
  while ((match = htmlImagePattern.exec(content)) !== null) {
    const normalized = normalizeSrc(match[1]);
    if (normalized) {
      images.add(normalized);
    }
  }

  return Array.from(images);
}

export function useImageCarousel({ readme, enabled = true }: UseImageCarouselOptions = {}) {
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const { prefetchAsset } = useAssetPrefetch();
  const allImages = useMemo(() => {
    if (!enabled || !readme) {
      return [];
    }
    return extractImagesFromReadme(readme);
  }, [enabled, readme]);

  useEffect(() => {
    if (!enabled || !allImages.length) {
      return;
    }

    allImages.slice(0, 6).forEach((src) => {
      prefetchAsset(src);
    });
  }, [allImages, enabled, prefetchAsset]);

  const handleImageClick = useCallback(
    (clickedSrc: string) => {
      if (!clickedSrc) return;

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

  const closeCarousel = useCallback(() => {
    setIsCarouselOpen(false);
  }, []);

  return {
    allImages,
    carouselInitialIndex,
    isCarouselOpen,
    handleImageClick,
    closeCarousel,
  };
}
