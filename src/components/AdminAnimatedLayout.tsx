'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Admin animated layout - wider variant of AnimatedLayout for admin content
 * Uses max-w-6xl instead of max-w-4xl to accommodate tables and editors
 */
export function AdminAnimatedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Full screen fixed blur overlay, visible on mobile devices only (hidden at md and above) */}
      <div className="fixed inset-0 z-0 backdrop-blur-sm md:hidden" />
      <motion.div
        layout
        className="relative z-10 flex w-full max-w-6xl flex-col overflow-hidden border-white/20 text-white backdrop-blur-sm md:border"
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
