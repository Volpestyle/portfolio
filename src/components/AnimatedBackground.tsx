'use client';
import React, { useEffect, useState } from 'react';
import { useSpring, animated } from '@react-spring/web';

const AnimatedBackground: React.FC = () => {
  // mounted state to ensure animation starts after component is mounted
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const props = useSpring({
    from: { transform: 'translateY(0%)' },
    to: { transform: 'translateY(-50%)' },
    config: {
      duration: 60000,
      precision: 0.1,
    },
    loop: true,
    immediate: !mounted, // Don't start animation until mounted
    reset: true,
  });

  return (
    <animated.div
      style={{
        ...props,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '200%',
        backgroundImage: "url('/images/me-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: -1,
        willChange: 'transform',
        backfaceVisibility: 'hidden', // Improve performance
      }}
      data-testid="animated-background"
    />
  );
};

export default AnimatedBackground;
