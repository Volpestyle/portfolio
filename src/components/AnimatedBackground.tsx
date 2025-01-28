'use client';
import React from 'react';
import { useSpring, animated } from '@react-spring/web';

const AnimatedBackground: React.FC = () => {
  const props = useSpring({
    from: { transform: 'translateY(0%)' },
    to: { transform: 'translateY(-50%)' },
    config: { duration: 60000 },
    loop: true,
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
      }}
    />
  );
};

export default AnimatedBackground;
