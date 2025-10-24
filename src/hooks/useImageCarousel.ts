import { useState, useCallback, useEffect } from 'react';

interface UseImageCarouselOptions {
  readme?: string | undefined;
  enabled?: boolean;
  fromDOM?: boolean;
}

export function useImageCarousel({ readme, enabled = false, fromDOM = false }: UseImageCarouselOptions) {
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);

  const collectImages = useCallback(() => {
    if (fromDOM) {
      const images = Array.from(document.querySelectorAll('.markdown-body img'))
        .map((img) => {
          const src = (img as HTMLImageElement).src;
          if (src.includes('localhost')) {
            const url = new URL(src);
            return url.pathname;
          }
          return src;
        })
        .filter(Boolean);
      setAllImages(images);
      return;
    }

    if (!readme) {
      setAllImages([]);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(readme, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));

    const imageSrcs = images
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

    setAllImages(imageSrcs);
  }, [fromDOM, readme]);

  useEffect(() => {
    if (enabled || fromDOM) {
      collectImages();
    }
  }, [enabled, fromDOM, collectImages]);

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
    collectImages();
  }, [collectImages]);

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
