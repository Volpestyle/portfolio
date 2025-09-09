import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UseImageCarouselOptions {
  pid?: string;
  readme?: string | undefined;
  enabled?: boolean;
  fromDOM?: boolean;
}

export function useImageCarousel({ pid, readme, enabled = false, fromDOM = false }: UseImageCarouselOptions) {
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);

  const { data: allImages = [], refetch: refetchImages } = useQuery({
    queryKey: fromDOM ? ['projectImages', pid] : ['readme-images', readme],
    queryFn: () => {
      if (fromDOM) {
        return Array.from(document.querySelectorAll('.markdown-body img'))
          .map((img) => {
            const src = (img as HTMLImageElement).src;
            if (src.includes('localhost')) {
              const url = new URL(src);
              return url.pathname;
            }
            return src;
          })
          .filter(Boolean);
      }
      
      if (!readme) return [];
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(readme, 'text/html');
      const images = Array.from(doc.querySelectorAll('img'));
      
      return images
        .map((img) => img.getAttribute('src'))
        .filter((src): src is string => src !== null)
        .map((src) => {
          if (src.includes('localhost')) {
            const url = new URL(src);
            return url.pathname;
          }
          return src;
        })
        .filter(Boolean);
    },
    enabled,
  });

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

  const handleImageLoad = useCallback(() => {
    refetchImages();
  }, [refetchImages]);

  const closeCarousel = useCallback(() => {
    setIsCarouselOpen(false);
  }, []);

  return {
    allImages,
    carouselInitialIndex,
    isCarouselOpen,
    handleImageClick,
    handleImageLoad,
    closeCarousel,
  };
}