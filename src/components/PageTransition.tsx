'use client';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { usePathname } from 'next/navigation';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { FrozenRouter } from './FrozenRouter';
import { Spinner } from '@/components/ui/spinner';

const PageTransitionContext = createContext(false);

export function usePageTransition() {
  return useContext(PageTransitionContext);
}

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    <PageTransitionContext.Provider value={isTransitioning}>
      <div className="relative flex w-full flex-1 flex-col">
        {/* Content layer - stays hidden during transition, frame resizes to fit */}
        <AnimatePresence mode="popLayout">
          <TransitionPane pathname={pathname} isTransitioning={isTransitioning}>
            {children}
          </TransitionPane>
        </AnimatePresence>

        {/* Spinner overlay - portaled to body, completely outside framer-motion */}
        {mounted &&
          createPortal(
            <div
              className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
                isTransitioning ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Spinner variant="ring" size="lg" />
            </div>,
            document.body
          )}
      </div>
    </PageTransitionContext.Provider>
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
