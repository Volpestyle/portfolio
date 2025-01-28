'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  pid: string;
  onImageLoad: (src: string) => void;
  onImageClick: (src: string) => void;
}

/**
 * A component that renders an image from either a direct URL or a GitHub repository.
 * @param {string} src - The source path or URL of the image
 * @param {string} alt - Alt text for the image
 * @param {string} pid - The GitHub repository ID/name
 * @param {number|string} width - Width of the image
 * @param {number|string} height - Height of the image
 * @param {function} onImageLoad - Callback fired when image is loaded with final src
 * @param {function} onImageClick - Callback fired when image is clicked
 * @param {object} rest - Additional image props passed through
 */
const ImageRenderer: React.FC<ImageProps> = ({ src, alt, pid, width, height, onImageLoad, onImageClick, ...rest }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    const fetchImage = async () => {
      if (src.startsWith('http')) {
        setImageSrc(src);
        onImageLoad(src);
        return;
      }

      const branches = ['main', 'master'];
      for (const branch of branches) {
        const url = `https://raw.githubusercontent.com/volpestyle/${pid}/${branch}/${src.replace(/^\.\//, '')}`;
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            setImageSrc(url);
            onImageLoad(url);
            return;
          }
        } catch (error) {
          console.error(`Error checking image at ${url}:`, error);
        }
      }

      console.error(`Failed to find image: ${src}`);
    };

    fetchImage();
  }, [src, pid, onImageLoad]);

  if (!imageSrc) return null;

  const imageWidth = width ? parseInt(width.toString(), 10) : 500;
  const imageHeight = height ? parseInt(height.toString(), 10) : 300;

  return (
    <div className="py-4">
      <Image
        src={imageSrc}
        alt={alt || ''}
        width={imageWidth}
        height={imageHeight}
        className="h-auto max-w-full cursor-pointer"
        onClick={() => onImageClick(imageSrc)}
        priority // This ensures the image is loaded immediately
        {...rest}
      />
    </div>
  );
};

export default ImageRenderer;
