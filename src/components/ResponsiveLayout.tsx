'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Responsive layout that adapts its max-width based on the current route.
 * - Base routes: max-w-4xl
 * - Admin routes: max-w-6xl (wider for tables and editors)
 *
 * This single component replaces AnimatedLayout and AdminAnimatedLayout,
 * allowing children (like the header) to stay mounted across route changes.
 */
export function ResponsiveLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  return (
    <>
      {/* Full screen fixed blur overlay, visible on mobile devices only (hidden at md and above) */}
      <div className="fixed inset-0 z-0 backdrop-blur-sm md:hidden" />
      <motion.div
        layout
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden border-white/20 text-white backdrop-blur-sm md:border',
          isAdminRoute ? 'max-w-6xl' : 'max-w-4xl'
        )}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
