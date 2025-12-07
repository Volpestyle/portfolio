'use client';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FrozenRouter } from './FrozenRouter';
import { Spinner } from '@/components/ui/spinner';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevPathname = useRef(pathname);

  useLayoutEffect(() => {
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
        <TransitionPane pathname={pathname} isTransitioning={isTransitioning}>
          {children}
        </TransitionPane>
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
            className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-[10svh] md:items-center md:pt-0"
          >
            <Spinner variant="ring" size="lg" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransitionPane({
  children,
  pathname,
  isTransitioning,
}: {
  children: ReactNode;
  pathname: string | null;
  isTransitioning: boolean;
}) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      key={pathname ?? 'root'}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isTransitioning && isPresent ? 0 : 1,
        y: isTransitioning && isPresent ? 10 : 0,
      }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: 0.4,
        ease: [0.2, 0, 0.2, 1],
      }}
      className="w-full"
      aria-hidden={!isPresent}
      style={!isPresent ? { pointerEvents: 'none' } : undefined}
    >
      <FrozenRouter>{children}</FrozenRouter>
    </motion.div>
  );
}
