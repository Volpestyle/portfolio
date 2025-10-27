'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Modal from '@/components/ui/modal';
import { AnimatedIconButton } from '@/components/ui/AnimatedIconButton';

interface ImageCarouselProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, initialIndex, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : images.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex < images.length - 1 ? prevIndex + 1 : 0));
  };

  if (!images.length) {
    return null;
  }

  const currentImage = images[currentIndex] ?? images[0];
  if (!currentImage) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none rounded-none"
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
        <AnimatedIconButton
          label="Close gallery"
          icon={<X className="h-5 w-5" />}
          onClick={onClose}
          wrapperClassName="absolute right-6 top-6"
        />

        <AnimatedIconButton
          label="Previous image"
          icon={<ChevronLeft className="h-6 w-6" />}
          onClick={goToPrevious}
          wrapperClassName="absolute left-6 top-1/2 -translate-y-1/2"
          size="lg"
        />

        <AnimatedIconButton
          label="Next image"
          icon={<ChevronRight className="h-6 w-6" />}
          onClick={goToNext}
          wrapperClassName="absolute right-6 top-1/2 -translate-y-1/2"
          size="lg"
        />

        <div className="max-h-[85vh] max-w-[90vw]">
          <Image
            src={currentImage}
            alt={`Image ${currentIndex + 1}`}
            width={1920}
            height={1080}
            className="max-h-full max-w-full object-contain"
            priority
            sizes="(max-width: 768px) 90vw, (max-width: 1200px) 80vw, 70vw"
          />
          <div className="mt-4 text-center text-sm text-white/70">
            {currentIndex + 1} / {images.length}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImageCarousel;
