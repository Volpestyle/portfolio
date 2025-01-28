'use client';
import React, { useEffect, useState } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { usePathname } from 'next/navigation';

const AnimatedBackground: React.FC = () => {
  const [startPosition, setStartPosition] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Trigger animation start
    setIsLoaded(true);
  }, [pathname]);

  const props = useSpring({
    from: { transform: `translateY(${startPosition}%)` },
    to: { transform: 'translateY(-50%)' },
    config: { duration: 60000 },
    reset: false,
    loop: true,
    immediate: !isLoaded, // Prevent animation until component is ready
    onChange: ({ value }) => {
      // Store current position in sessionStorage
      const match = value.transform.match(/translateY\(([-\d.]+)%\)/);
      if (match) {
        const position = parseFloat(match[1]);
        sessionStorage.setItem('backgroundPosition', position.toString());
      }
    },
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
        willChange: 'transform', // Optimize performance
      }}
    />
  );
};

export default AnimatedBackground;
