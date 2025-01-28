'use client';

import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Image from 'next/image';

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

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Image Carousel"
      className="fixed inset-0 z-50 flex items-center justify-center"
      overlayClassName="fixed inset-0 bg-black bg-opacity-75 z-50"
      style={{
        overlay: {
          zIndex: 9999,
        },
        content: {
          position: 'relative',
          background: 'none',
          border: 'none',
          padding: 0,
        },
      }}
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-4xl text-white hover:text-gray-300"
          aria-label="Close modal"
        >
          ×
        </button>
        <Image
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          width={1920}
          height={1080}
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 transform text-6xl text-white hover:text-gray-300"
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 transform text-6xl text-white hover:text-gray-300"
          aria-label="Next image"
        >
          ›
        </button>
      </div>
    </Modal>
  );
};

export default ImageCarousel;
