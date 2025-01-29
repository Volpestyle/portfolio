'use client';
import React from 'react';

const AnimatedBackground: React.FC = () => {
  return (
    <div
      className="animate-background fixed left-0 top-0 -z-10 h-[200%] w-full bg-cover bg-center will-change-transform"
      style={{
        backgroundImage: "url('/images/me-bg.png')",
        backfaceVisibility: 'hidden',
      }}
      data-testid="animated-background"
    />
  );
};

export default AnimatedBackground;
