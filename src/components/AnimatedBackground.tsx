'use client';
import Image from 'next/image';
import React from 'react';

const AnimatedBackground: React.FC = () => {
  return (
    <div
      className="fixed left-0 top-0 -z-10 h-[200%] w-full overflow-hidden"
      style={{
        backfaceVisibility: 'hidden',
      }}
      data-testid="animated-background"
      aria-hidden
    >
      <div className="animate-background relative h-full w-full will-change-transform">
        <Image
          src="/images/me-bg.png"
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
    </div>
  );
};

export default AnimatedBackground;
