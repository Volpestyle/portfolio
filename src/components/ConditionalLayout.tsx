'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedBackground from '@/components/AnimatedBackground';
import { AdminBackground } from '@/components/AdminBackground';
import { ResponsiveLayout } from '@/components/ResponsiveLayout';
import { PageTransition, PageTransitionProvider } from '@/components/PageTransition';
import { UnifiedHeader } from '@/components/navigation';

interface ConditionalLayoutProps {
  children: ReactNode;
}

/** Crossfade transition for background changes */
const backgroundTransition = {
  duration: 0.5,
  ease: [0.4, 0, 0.2, 1] as const,
};

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // Single tree structure - header stays mounted across all route changes
  // Only the background crossfades and the layout width animates
  return (
    <PageTransitionProvider>
      {/* Background layer with crossfade */}
      <AnimatePresence mode="wait">
        {isAdminRoute ? (
          <motion.div
            key="admin-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backgroundTransition}
          >
            <AdminBackground />
          </motion.div>
        ) : (
          <motion.div
            key="base-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backgroundTransition}
          >
            <AnimatedBackground />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content layer - header stays mounted, layout adapts width */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <ResponsiveLayout>
          <UnifiedHeader />
          <PageTransition>
            <main className="px-4 py-8 sm:px-8">{children}</main>
          </PageTransition>
        </ResponsiveLayout>
      </div>
    </PageTransitionProvider>
  );
}
