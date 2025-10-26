'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Spinner, SpinnerVariant } from './ui/spinner';

interface LoadingOverlayProps {
  children: ReactNode;
  spinnerVariant?: SpinnerVariant;
  spinnerSize?: 'sm' | 'md' | 'lg';
  customSpinner?: ReactNode;
}

export function LoadingOverlay({
  children,
  spinnerVariant = 'default',
  spinnerSize = 'md',
  customSpinner,
}: LoadingOverlayProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 500); // Match this to your exit duration

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="relative">
      <div className="relative">{children}</div>
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black"
          >
            {customSpinner || <Spinner variant={spinnerVariant} size={spinnerSize} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
