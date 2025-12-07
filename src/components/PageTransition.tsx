'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { FrozenRouter } from './FrozenRouter';
import { Spinner } from '@/components/ui/spinner';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      setIsTransitioning(true);
      prevPathname.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning]);

  return (
    <div className="relative flex w-full flex-1 flex-col">
      {/* Content layer - stays hidden during transition, frame resizes to fit */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: isTransitioning ? 0 : 1,
            y: isTransitioning ? 10 : 0,
          }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            duration: 0.4,
            ease: [0.2, 0, 0.2, 1],
          }}
          className="w-full"
        >
          <FrozenRouter>{children}</FrozenRouter>
        </motion.div>
      </AnimatePresence>

      {/* Spinner overlay - absolutely positioned, no layout impact */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            key="spinner-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <Spinner variant="ring" size="lg" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
